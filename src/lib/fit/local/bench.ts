/// <reference types="@webgpu/types" />
import type { BenchResult } from './protocol';
import type { LocalModel } from './model';

/**
 * PRE-DOWNLOAD MICROBENCHMARK (gate step 5) — about 200 ms of WebGPU work
 * shaped like the model, turned into an estimated time to first row, so a
 * visitor on a slow GPU is told "about N s" BEFORE a 700 MB download.
 *
 * Two kernels, because a first row costs two different things:
 *
 *   prefill  reading the ~3k-token prompt is a batch of matmuls: COMPUTE
 *            bound. Measured with a 16×16-tiled f32 matmul of
 *            [256 × hidden] · [hidden × hidden].
 *   decode   each generated token re-reads every weight once: BANDWIDTH
 *            bound. Measured with a vec4 matrix–vector product streaming a
 *            [hidden × 4·hidden] f32 matrix (the MLP's up-projection shape).
 *
 * ESTIMATE (all times in ms):
 *
 *   prefillFlops = 2 · activeParams · P  +  2 · layers · P² · hidden
 *                  (weight matmuls)         (causal attention, QKᵀ and AV)
 *   prefillMs    = prefillFlops / (gflops · 1e6)
 *   decodeMs     = T · downloadBytes / (gbps · 1e6)
 *   estimate     = CALIBRATION · (prefillMs + decodeMs) + OVERHEAD_MS
 *
 *   P = PROMPT_TOKENS (3000: ~500-token vocabulary + instructions + a long JD)
 *   T = FIRST_ROW_TOKENS (80: `{"role": …, "requirements": [` + one item)
 *   downloadBytes stands in for bytes read per decoded token (4-bit weights)
 *
 * CALIBRATION is PROVISIONAL, from one measurement: Apple GPU (Metal),
 * Chromium 149 new-headless, Llama-3.2-1B, 833-token prompt: the uncalibrated
 * estimate was 9.6 s, the measured first row 2.2 s (ratio 0.23; 0.25 keeps
 * it slightly pessimistic). `npm run fit:bench` refits it from real
 * first-row times on the reference devices (evals/devices.json). It absorbs what
 * this crude proxy gets wrong: WebLLM's kernels are f16/q4 and better tuned
 * than this f32 tile (factor < 1), while tokenization, grammar masking and
 * prefill chunking add time (factor > 1). The estimate only has to separate
 * "a few seconds" from "a minute"; the runtime watchdog catches the rest.
 *
 * Runs in the worker only (it needs `navigator.gpu`). `estimateFirstRowMs`
 * is pure and unit-tested.
 */

export const PROMPT_TOKENS = 3000;
export const FIRST_ROW_TOKENS = 80;
export const CALIBRATION = 0.25;
export const OVERHEAD_MS = 300;

/** Per-kernel time budget; two kernels ≈ 200 ms of measured work. */
const KERNEL_BUDGET_MS = 100;
/** Give up on a kernel after this long, whatever the budget said. */
const KERNEL_HARD_CAP_MS = 1500;
const MATMUL_ROWS = 256;
const TILE = 16;

export function estimateFirstRowMs(
  measured: { gflops: number; gbps: number },
  model: Pick<LocalModel, 'activeParams' | 'layers' | 'hiddenSize' | 'downloadBytes'>,
  opts: { promptTokens?: number; firstRowTokens?: number; calibration?: number } = {},
): number {
  const P = opts.promptTokens ?? PROMPT_TOKENS;
  const T = opts.firstRowTokens ?? FIRST_ROW_TOKENS;
  const k = opts.calibration ?? CALIBRATION;
  if (!(measured.gflops > 0) || !(measured.gbps > 0)) return Number.POSITIVE_INFINITY;
  const prefillFlops = 2 * model.activeParams * P + 2 * model.layers * P * P * model.hiddenSize;
  const prefillMs = prefillFlops / (measured.gflops * 1e6);
  const decodeMs = (T * model.downloadBytes) / (measured.gbps * 1e6);
  return k * (prefillMs + decodeMs) + OVERHEAD_MS;
}

// ------------------------------------------------------------------ WGSL

const MATMUL_WGSL = /* wgsl */ `
struct Dims { M: u32, N: u32, K: u32, pad: u32 };
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
@group(0) @binding(3) var<uniform> dims: Dims;
var<workgroup> tA: array<array<f32, ${TILE}>, ${TILE}>;
var<workgroup> tB: array<array<f32, ${TILE}>, ${TILE}>;
@compute @workgroup_size(${TILE}, ${TILE})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let row = gid.y;
  let col = gid.x;
  var acc = 0.0;
  for (var t = 0u; t < dims.K / ${TILE}u; t++) {
    tA[lid.y][lid.x] = A[row * dims.K + t * ${TILE}u + lid.x];
    tB[lid.y][lid.x] = B[(t * ${TILE}u + lid.y) * dims.N + col];
    workgroupBarrier();
    for (var k = 0u; k < ${TILE}u; k++) {
      acc += tA[lid.y][k] * tB[k][lid.x];
    }
    workgroupBarrier();
  }
  C[row * dims.N + col] = acc;
}`;

const MATVEC_WGSL = /* wgsl */ `
struct Dims { N4: u32, K: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read> W: array<vec4f>;
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read_write> y: array<vec4f>;
@group(0) @binding(3) var<uniform> dims: Dims;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n = gid.x;
  if (n >= dims.N4) { return; }
  var acc = vec4f(0.0);
  for (var k = 0u; k < dims.K; k++) {
    acc += W[k * dims.N4 + n] * x[k];
  }
  y[n] = acc;
}`;

// ------------------------------------------------------------------ runner

interface Kernel {
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  workgroups: [number, number];
  /** FLOPs or bytes per dispatch, whichever the kernel measures. */
  work: number;
  buffers: GPUBuffer[];
}

function storage(device: GPUDevice, bytes: number, fill = false): GPUBuffer {
  const buffer = device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    mappedAtCreation: fill,
  });
  if (fill) {
    // Non-zero, non-denormal data so no driver can shortcut the arithmetic.
    new Float32Array(buffer.getMappedRange()).fill(0.5);
    buffer.unmap();
  }
  return buffer;
}

function uniform(device: GPUDevice, values: number[]): GPUBuffer {
  const buffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, new Uint32Array(values));
  return buffer;
}

async function makeKernel(
  device: GPUDevice,
  code: string,
  buffers: GPUBuffer[],
  workgroups: [number, number],
  work: number,
): Promise<Kernel> {
  // Async pipeline creation only: shader compilation never blocks a thread.
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  return { pipeline, bindGroup, workgroups, work, buffers };
}

async function submit(device: GPUDevice, kernel: Kernel, times: number): Promise<void> {
  const encoder = device.createCommandEncoder();
  for (let i = 0; i < times; i++) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(kernel.pipeline);
    pass.setBindGroup(0, kernel.bindGroup);
    pass.dispatchWorkgroups(kernel.workgroups[0], kernel.workgroups[1]);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
}

/** Work per millisecond, from batches that together fill `budgetMs`. */
async function measure(device: GPUDevice, kernel: Kernel, now: () => number): Promise<number> {
  await submit(device, kernel, 1); // warm-up: first-dispatch costs aren't throughput
  let batch = 1;
  let work = 0;
  let time = 0;
  const start = now();
  while (time < KERNEL_BUDGET_MS && now() - start < KERNEL_HARD_CAP_MS) {
    const t0 = now();
    await submit(device, kernel, batch);
    const dt = now() - t0;
    work += kernel.work * batch;
    time += dt;
    if (dt < KERNEL_BUDGET_MS / 4) batch *= 2;
  }
  return time > 0 ? work / time : 0;
}

/**
 * Runs both kernels on a fresh device (never WebLLM's), then destroys it.
 * Wall-clock timing around `onSubmittedWorkDone` rather than timestamp
 * queries, which are an optional feature.
 */
export async function runBench(
  gpu: GPU,
  model: LocalModel,
  now: () => number = () => performance.now(),
): Promise<BenchResult> {
  const t0 = now();
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  try {
    const H = Math.ceil(model.hiddenSize / TILE) * TILE;
    const M = MATMUL_ROWS;

    const matmul = await makeKernel(
      device,
      MATMUL_WGSL,
      [storage(device, M * H * 4, true), storage(device, H * H * 4, true), storage(device, M * H * 4), uniform(device, [M, H, H, 0])],
      [H / TILE, M / TILE],
      2 * M * H * H,
    );

    // [H × 4H] f32; stays under the 128 MiB default binding limit up to H = 2896.
    const N4 = H; // 4H columns as H vec4s
    const matvec = await makeKernel(
      device,
      MATVEC_WGSL,
      [storage(device, H * N4 * 16, true), storage(device, H * 4, true), storage(device, N4 * 16), uniform(device, [N4, H, 0, 0])],
      [Math.ceil(N4 / 256), 1],
      H * N4 * 16,
    );

    const flopsPerMs = await measure(device, matmul, now);
    const bytesPerMs = await measure(device, matvec, now);
    for (const buffer of [...matmul.buffers, ...matvec.buffers]) buffer.destroy();

    const measured = { gflops: flopsPerMs / 1e6, gbps: bytesPerMs / 1e6 };
    return {
      ...measured,
      elapsedMs: now() - t0,
      estimatedFirstRowMs: estimateFirstRowMs(measured, model),
    };
  } finally {
    device.destroy();
  }
}
