import { describe, it, expect, vi } from 'vitest';

import { estimateFirstRowMs } from '@/lib/fit/local/bench';
import {
  BENCH_LIMIT_MS,
  STORAGE_MARGIN_BYTES,
  TOO_SLOW_KEY,
  evaluateAdapter,
  evaluateBench,
  evaluateStorage,
  isTooSlowLatched,
  latchTooSlow,
  privateModeOffer,
  probeGpu,
  saveDataOn,
  type AdapterLike,
} from '@/lib/fit/local/gate';
import { LOCAL_MODEL, LOCAL_MODELS } from '@/lib/fit/local/model';

const GiB = 1024 ** 3;

function adapter(overrides: Partial<AdapterLike['limits']> = {}, opts: { f16?: boolean; fallback?: boolean } = {}): AdapterLike {
  const features = new Set(opts.f16 === false ? [] : ['shader-f16']);
  return {
    features: { has: (f) => features.has(f), forEach: (cb) => features.forEach((f) => cb(f)) },
    limits: {
      maxBufferSize: 4 * GiB,
      maxStorageBufferBindingSize: 2 * GiB,
      maxComputeWorkgroupStorageSize: 32768,
      maxStorageBuffersPerShaderStage: 10,
      ...overrides,
    },
    info: { vendor: 'apple', architecture: 'metal-3', description: '', isFallbackAdapter: opts.fallback ?? false },
  };
}

/** A fake `navigator.gpu` whose requestAdapter resolves to `result`. */
function fakeGpu(result: AdapterLike | null | Error) {
  return {
    requestAdapter: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as GPU;
}

describe('gate step 1: hard requirements', () => {
  it('accepts a capable hardware adapter', async () => {
    const result = await probeGpu(fakeGpu(adapter()), LOCAL_MODEL);
    expect(result.supported).toBe(true);
    expect(result.features).toContain('shader-f16');
    expect(result.adapter?.vendor).toBe('apple');
  });

  it('fails when WebGPU is missing in the worker', async () => {
    expect(await probeGpu(undefined, LOCAL_MODEL)).toEqual({ supported: false, reason: 'no-webgpu-in-worker' });
  });

  it('fails when there is no adapter, or requestAdapter throws', async () => {
    expect((await probeGpu(fakeGpu(null), LOCAL_MODEL)).reason).toBe('no-adapter');
    expect((await probeGpu(fakeGpu(new Error('blocked')), LOCAL_MODEL)).reason).toBe('no-adapter');
  });

  it('rejects software (fallback) adapters such as SwiftShader', () => {
    expect(evaluateAdapter(adapter({}, { fallback: true }), LOCAL_MODEL).reason).toBe('fallback-adapter');
    // Older Chromium put the flag on the adapter itself.
    const legacy = { ...adapter(), info: undefined, isFallbackAdapter: true };
    expect(evaluateAdapter(legacy, LOCAL_MODEL).reason).toBe('fallback-adapter');
  });

  it('requires shader-f16 for q4f16 models', () => {
    expect(evaluateAdapter(adapter({}, { f16: false }), LOCAL_MODEL).reason).toBe('no-shader-f16');
  });

  it.each([
    ['maxBufferSize', 128 * 1024 * 1024],
    ['maxStorageBufferBindingSize', 128 * 1024 * 1024],
    ['maxComputeWorkgroupStorageSize', 16384],
    ['maxStorageBuffersPerShaderStage', 8],
  ] as const)('rejects %s below the floor', (limit, value) => {
    expect(evaluateAdapter(adapter({ [limit]: value }), LOCAL_MODEL).reason).toBe('limits');
  });

  it('accepts exactly the floor', () => {
    const floor = adapter({
      maxBufferSize: LOCAL_MODEL.minBufferBytes,
      maxStorageBufferBindingSize: LOCAL_MODEL.minStorageBufferBindingBytes,
    });
    expect(evaluateAdapter(floor, LOCAL_MODEL).supported).toBe(true);
  });
});

describe('gate step 2: Data Saver', () => {
  it('is on only when connection.saveData is exactly true', () => {
    expect(saveDataOn({ connection: { saveData: true } } as unknown as Navigator)).toBe(true);
    expect(saveDataOn({ connection: { saveData: false } } as unknown as Navigator)).toBe(false);
    expect(saveDataOn({} as Navigator)).toBe(false); // Safari, Firefox
    expect(saveDataOn(undefined)).toBe(false);
  });
});

describe('gate step 3: storage', () => {
  const need = LOCAL_MODEL.downloadBytes + STORAGE_MARGIN_BYTES;

  it('passes with room for the weights plus the margin, fails without', () => {
    expect(evaluateStorage({ quota: need + 1000, usage: 1000 }, LOCAL_MODEL).ok).toBe(true);
    const tight = evaluateStorage({ quota: need, usage: 1 }, LOCAL_MODEL);
    expect(tight).toMatchObject({ ok: false, neededBytes: need, availableBytes: need - 1 });
  });

  it('needs nothing when the model is already cached', () => {
    expect(evaluateStorage({ quota: 0, usage: 0 }, LOCAL_MODEL, true)).toMatchObject({ ok: true, neededBytes: 0, cached: true });
  });

  it('does not block when the browser cannot estimate', () => {
    expect(evaluateStorage(null, LOCAL_MODEL)).toMatchObject({ ok: true, availableBytes: null });
    expect(evaluateStorage({}, LOCAL_MODEL).ok).toBe(true);
  });
});

describe('gate step 5: benchmark estimate', () => {
  it('follows the documented formula', () => {
    const model = { activeParams: 1e9, layers: 10, hiddenSize: 1000, downloadBytes: 5e8 };
    const ms = estimateFirstRowMs({ gflops: 1000, gbps: 100 }, model, { promptTokens: 100, firstRowTokens: 10, calibration: 1 });
    const prefill = (2 * 1e9 * 100 + 2 * 10 * 100 * 100 * 1000) / (1000 * 1e6);
    const decode = (10 * 5e8) / (100 * 1e6);
    expect(ms).toBeCloseTo(prefill + decode + 300, 6);
  });

  it('is infinite (never ok) when the benchmark measured nothing', () => {
    const ms = estimateFirstRowMs({ gflops: 0, gbps: 10 }, LOCAL_MODEL);
    expect(ms).toBe(Number.POSITIVE_INFINITY);
    expect(evaluateBench({ gflops: 0, gbps: 10, elapsedMs: 1, estimatedFirstRowMs: ms }).ok).toBe(false);
  });

  it('a fast GPU passes and a slow one gets "about N s"', () => {
    const fast = estimateFirstRowMs({ gflops: 2000, gbps: 200 }, LOCAL_MODEL);
    const slow = estimateFirstRowMs({ gflops: 50, gbps: 10 }, LOCAL_MODEL);
    expect(fast).toBeLessThan(BENCH_LIMIT_MS);
    expect(evaluateBench({ gflops: 2000, gbps: 200, elapsedMs: 1, estimatedFirstRowMs: fast }).ok).toBe(true);
    const verdict = evaluateBench({ gflops: 50, gbps: 10, elapsedMs: 1, estimatedFirstRowMs: slow });
    expect(verdict.ok).toBe(false);
    expect(verdict.seconds).toBe(Math.round(slow / 1000));
  });

  it('ranks the shortlist by cost', () => {
    const m = { gflops: 500, gbps: 50 };
    const cost = (id: keyof typeof LOCAL_MODELS) => estimateFirstRowMs(m, LOCAL_MODELS[id]);
    expect(cost('Llama-3.2-1B-Instruct-q4f16_1-MLC')).toBeLessThan(cost('Qwen3-1.7B-q4f16_1-MLC'));
  });
});

describe('gate step 6: too-slow latch', () => {
  it('round-trips through sessionStorage', () => {
    sessionStorage.removeItem(TOO_SLOW_KEY);
    expect(isTooSlowLatched(sessionStorage)).toBe(false);
    latchTooSlow(sessionStorage);
    expect(isTooSlowLatched(sessionStorage)).toBe(true);
    sessionStorage.removeItem(TOO_SLOW_KEY);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(isTooSlowLatched(broken)).toBe(false);
    expect(() => latchTooSlow(broken)).not.toThrow();
  });
});

describe('privateModeOffer', () => {
  const ok = { supported: true } as const;

  it('shows "checking" until the probe answers', () => {
    expect(privateModeOffer({ probe: null, saveData: false, tooSlowLatched: false })).toEqual({ state: 'checking' });
  });

  it('hides the button (no nagging) when step 1 fails', () => {
    expect(privateModeOffer({ probe: { supported: false, reason: 'no-adapter' }, saveData: true, tooSlowLatched: true })).toEqual({
      state: 'hidden',
      reason: 'no-adapter',
    });
  });

  it('disables it for Data Saver, then for the latch', () => {
    expect(privateModeOffer({ probe: ok, saveData: true, tooSlowLatched: true })).toMatchObject({
      state: 'disabled',
      reason: 'save-data',
      message: 'Private mode is off because Data Saver is on.',
    });
    expect(privateModeOffer({ probe: ok, saveData: false, tooSlowLatched: true })).toMatchObject({ state: 'disabled', reason: 'too-slow' });
  });

  it('offers it otherwise', () => {
    expect(privateModeOffer({ probe: ok, saveData: false, tooSlowLatched: false })).toEqual({ state: 'available' });
  });
});
