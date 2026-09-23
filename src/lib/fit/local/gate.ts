/// <reference types="@webgpu/types" />
import type { BenchResult, ProbeResult } from './protocol';
import type { LocalModel } from './model';

/**
 * PRIVATE MODE GATE — the plan's steps 1–6 as pure decisions.
 *
 * Like `morph-canvas.tsx`, nothing here guesses from hardware hints
 * (`deviceMemory` is missing on iOS, `hardwareConcurrency` counts CPU cores).
 * It checks hard requirements, then stated preferences, then measures. Every
 * function takes its inputs as arguments (an adapter, a storage estimate, a
 * `Storage`), so the rules are unit-tested with fakes; `worker.ts` and
 * `client.ts` only supply the real objects.
 *
 *   1. hard requirements   probeGpu / evaluateAdapter  (in a throwaway worker)
 *   2. stated preference   saveDataOn                  (Data Saver)
 *   3. storage             evaluateStorage             (on press)
 *   4. consent             the UI's dialog
 *   5. microbenchmark      evaluateBench               (before the download)
 *   6. runtime watchdog    FIRST_ROW_BUDGET_MS         (in the worker) + latch
 */

/** Step 5: estimated time to first row above which the download isn't offered by default. */
export const BENCH_LIMIT_MS = 10_000;
/** Step 6: the watchdog's budget from `run` to the first row. */
export const FIRST_ROW_BUDGET_MS = 15_000;
/** Step 3: headroom on top of the weights (WASM lib, tokenizer, cache overhead). */
export const STORAGE_MARGIN_BYTES = 200 * 1024 * 1024;
/** sessionStorage key for the step-6 latch. */
export const TOO_SLOW_KEY = 'fit:private-mode:too-slow';

// ------------------------------------------------------------ step 1

/** The parts of a `GPUAdapter` the gate reads; a real adapter satisfies it. */
export interface AdapterLike {
  features: { has(name: string): boolean; forEach?: (cb: (f: string) => void) => void };
  limits: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
    maxStorageBuffersPerShaderStage: number;
  };
  info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean };
  /** Pre-2025 location of the flag. */
  isFallbackAdapter?: boolean;
}

/** WebLLM's own floor (`detectGPUDevice` in 0.2.85). */
const WEBLLM_MIN_WORKGROUP_STORAGE = 32 * 1024;
const WEBLLM_MIN_STORAGE_BUFFERS = 10;

export function evaluateAdapter(adapter: AdapterLike, model: LocalModel): ProbeResult {
  const features: string[] = [];
  adapter.features.forEach?.((f) => features.push(f));
  const limits = {
    maxBufferSize: adapter.limits.maxBufferSize,
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
    maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
  };
  const isFallbackAdapter = adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false;
  const info = {
    vendor: adapter.info?.vendor ?? '',
    architecture: adapter.info?.architecture ?? '',
    description: adapter.info?.description ?? '',
    isFallbackAdapter,
  };
  const base = { adapter: info, limits, features };

  if (isFallbackAdapter) return { supported: false, reason: 'fallback-adapter', ...base };
  if (model.needsShaderF16 && !adapter.features.has('shader-f16')) {
    return { supported: false, reason: 'no-shader-f16', ...base };
  }
  if (
    limits.maxBufferSize < model.minBufferBytes ||
    limits.maxStorageBufferBindingSize < model.minStorageBufferBindingBytes ||
    limits.maxComputeWorkgroupStorageSize < WEBLLM_MIN_WORKGROUP_STORAGE ||
    limits.maxStorageBuffersPerShaderStage < WEBLLM_MIN_STORAGE_BUFFERS
  ) {
    return { supported: false, reason: 'limits', ...base };
  }
  return { supported: true, ...base };
}

/**
 * Step 1, run INSIDE a worker: `gpu` is the worker's `navigator.gpu`, which
 * is exactly the question ("WebGPU available in a worker"), since some
 * browsers ship it on the main thread only.
 */
export async function probeGpu(gpu: GPU | undefined, model: LocalModel): Promise<ProbeResult> {
  if (!gpu) return { supported: false, reason: 'no-webgpu-in-worker' };
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch {
    adapter = null;
  }
  if (!adapter) return { supported: false, reason: 'no-adapter' };
  return evaluateAdapter(adapter as unknown as AdapterLike, model);
}

// ------------------------------------------------------------ step 2

/** Data Saver, read the same way as `useSaveData` (strict `=== true`). */
export function saveDataOn(nav: Navigator | undefined): boolean {
  const connection = (nav as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection;
  return connection?.saveData === true;
}

// ------------------------------------------------------------ step 3

export interface StorageCheck {
  ok: boolean;
  /** Bytes the check wanted free. */
  neededBytes: number;
  /** Bytes the browser said were free, or null when it can't say. */
  availableBytes: number | null;
  /** The model is already cached, so nothing needs to be downloaded. */
  cached: boolean;
}

/**
 * `navigator.storage.estimate()` is an estimate and some browsers pad it,
 * but it is the only signal there is. A missing API is not a failure: the
 * download proceeds and a quota error, if any, surfaces as `error: quota`.
 */
export function evaluateStorage(
  estimate: { quota?: number; usage?: number } | null,
  model: LocalModel,
  cached = false,
): StorageCheck {
  const neededBytes = cached ? 0 : model.downloadBytes + STORAGE_MARGIN_BYTES;
  if (cached) return { ok: true, neededBytes, availableBytes: null, cached };
  if (!estimate || typeof estimate.quota !== 'number') {
    return { ok: true, neededBytes, availableBytes: null, cached };
  }
  const availableBytes = Math.max(0, estimate.quota - (estimate.usage ?? 0));
  return { ok: availableBytes >= neededBytes, neededBytes, availableBytes, cached };
}

// ------------------------------------------------------------ step 5

export interface BenchVerdict {
  ok: boolean;
  /** Rounded seconds for "This device would take about N s." */
  seconds: number;
}

export function evaluateBench(bench: BenchResult, limitMs = BENCH_LIMIT_MS): BenchVerdict {
  const ms = bench.estimatedFirstRowMs;
  return { ok: Number.isFinite(ms) && ms <= limitMs, seconds: Math.max(1, Math.round(ms / 1000)) };
}

// ------------------------------------------------------------ step 6 latch

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null; // private mode / blocked storage: behave as "not latched"
  }
}

export function isTooSlowLatched(storage: Storage | undefined): boolean {
  return safeGet(storage, TOO_SLOW_KEY) === '1';
}

export function latchTooSlow(storage: Storage | undefined): void {
  try {
    storage?.setItem(TOO_SLOW_KEY, '1');
  } catch {
    /* the latch is a courtesy; without storage the watchdog still protects */
  }
}

// ------------------------------------------------------------ the button

export type PrivateModeOffer =
  | { state: 'checking' }
  | { state: 'hidden'; reason: ProbeResult['reason'] }
  | { state: 'disabled'; reason: 'save-data' | 'too-slow'; message: string }
  | { state: 'available' };

/**
 * What the /fit page shows for the Private-mode button, from steps 1, 2 and
 * the step-6 latch. A failed step 1 hides the button with no nagging.
 */
export function privateModeOffer(input: {
  probe: ProbeResult | null;
  saveData: boolean;
  tooSlowLatched: boolean;
}): PrivateModeOffer {
  if (!input.probe) return { state: 'checking' };
  if (!input.probe.supported) return { state: 'hidden', reason: input.probe.reason };
  if (input.saveData) {
    return {
      state: 'disabled',
      reason: 'save-data',
      message: 'Private mode is off because Data Saver is on.',
    };
  }
  if (input.tooSlowLatched) {
    return {
      state: 'disabled',
      reason: 'too-slow',
      message: 'Private mode was too slow on this device, so this check uses the keyword scan.',
    };
  }
  return { state: 'available' };
}
