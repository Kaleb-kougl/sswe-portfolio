import { describe, it, expect, vi, afterEach } from 'vitest';

import type { Requirement } from '@/lib/fit/contract';
import {
  LocalFitError,
  checkStorage,
  createLocalFitSession,
  getPrivateModeOffer,
  probeInWorker,
  type WorkerFactory,
} from '@/lib/fit/local/client';
import { TOO_SLOW_KEY } from '@/lib/fit/local/gate';
import { LOCAL_MODEL } from '@/lib/fit/local/model';
import type { FromWorker, ToWorker } from '@/lib/fit/local/protocol';

/**
 * The main-thread client against a fake Worker: the real request/response
 * bookkeeping, gating and latch, with the worker's replies scripted.
 */

type Script = (req: ToWorker, reply: (msg: FromWorker) => void) => void;

class FakeWorker extends EventTarget {
  terminated = false;
  sent: ToWorker[] = [];
  constructor(private script: Script) {
    super();
  }
  postMessage(req: ToWorker) {
    this.sent.push(req);
    queueMicrotask(() =>
      this.script(req, (msg) => {
        if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: msg }));
      }),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

function factory(script: Script) {
  const workers: FakeWorker[] = [];
  const create: WorkerFactory = () => {
    const w = new FakeWorker(script);
    workers.push(w);
    return w as unknown as Worker;
  };
  return { create, workers };
}

const row = (text: string): Requirement => ({
  text,
  priority: 'must',
  skills: [],
  otherSkills: [],
  minYears: null,
  verdict: 'gap',
  evidenceIds: [],
  note: '',
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeInWorker', () => {
  it('returns the worker verdict and terminates the worker', async () => {
    const { create, workers } = factory((req, reply) => {
      if (req.type === 'probe') reply({ type: 'probe_result', id: req.id, result: { supported: true } });
    });
    await expect(probeInWorker(create)).resolves.toMatchObject({ supported: true });
    expect(workers[0].terminated).toBe(true);
  });

  it('reports no-worker when construction throws', async () => {
    const create: WorkerFactory = () => {
      throw new Error('module workers unsupported');
    };
    await expect(probeInWorker(create)).resolves.toEqual({ supported: false, reason: 'no-worker', probe: null });
  });

  it('times out when the worker never answers', async () => {
    vi.useFakeTimers();
    const { create, workers } = factory(() => {});
    const outcome = probeInWorker(create, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(outcome).resolves.toMatchObject({ supported: false, reason: 'timeout' });
    expect(workers[0].terminated).toBe(true);
  });
});

describe('getPrivateModeOffer', () => {
  it('combines the probe, Data Saver and the session latch', () => {
    const ok = { supported: true, probe: { supported: true } };
    expect(getPrivateModeOffer(ok, false)).toEqual({ state: 'available' });
    expect(getPrivateModeOffer(ok, true)).toMatchObject({ state: 'disabled', reason: 'save-data' });
    sessionStorage.setItem(TOO_SLOW_KEY, '1');
    expect(getPrivateModeOffer(ok, false)).toMatchObject({ state: 'disabled', reason: 'too-slow' });
    expect(getPrivateModeOffer({ supported: false, reason: 'no-shader-f16', probe: null }, false)).toMatchObject({
      state: 'hidden',
      reason: 'no-shader-f16',
    });
    expect(getPrivateModeOffer(null, false)).toEqual({ state: 'checking' });
  });

  it('reads Data Saver from navigator.connection by default', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    expect(getPrivateModeOffer({ supported: true, probe: { supported: true } })).toMatchObject({ reason: 'save-data' });
  });
});

describe('checkStorage', () => {
  it('uses navigator.storage.estimate()', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ quota: 10e9, usage: 0 }) } });
    await expect(checkStorage()).resolves.toMatchObject({ ok: true, cached: false, availableBytes: 10e9 });
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ quota: 5e8, usage: 0 }) } });
    await expect(checkStorage()).resolves.toMatchObject({ ok: false });
  });

  it('treats a cached model as needing no space', async () => {
    const base = `https://huggingface.co/${LOCAL_MODEL.repo}/resolve/${LOCAL_MODEL.revision}/`;
    const store = new Map<string, Response>([
      [base + 'tensor-cache.json', new Response(JSON.stringify({ records: [{ dataPath: 'params_shard_0.bin' }, { dataPath: 'params_shard_1.bin' }] }))],
      [base + 'params_shard_0.bin', new Response('x')],
      [base + 'params_shard_1.bin', new Response('x')],
    ]);
    const cache = { match: async (url: string) => store.get(url)?.clone() };
    vi.stubGlobal('caches', { has: async () => true, open: async () => cache });
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ quota: 0, usage: 0 }) } });
    await expect(checkStorage()).resolves.toMatchObject({ ok: true, cached: true });

    store.delete(base + 'params_shard_1.bin'); // a half-finished download is NOT cached
    await expect(checkStorage()).resolves.toMatchObject({ ok: false, cached: false });
  });
});

describe('createLocalFitSession', () => {
  const happy: Script = (req, reply) => {
    switch (req.type) {
      case 'bench':
        reply({ type: 'bench_result', id: req.id, result: { gflops: 900, gbps: 90, elapsedMs: 210, estimatedFirstRowMs: 4000 } });
        return;
      case 'load':
        reply({ type: 'progress', id: req.id, progress: { phase: 'download', fraction: 0.5, loadedBytes: 1, totalBytes: 2, text: '' } });
        reply({ type: 'loaded', id: req.id, fromCache: false, elapsedMs: 5 });
        return;
      case 'run':
        reply({ type: 'row', id: req.id, index: 0, row: row('a') });
        reply({ type: 'row', id: req.id, index: 1, row: row('b') });
        reply({
          type: 'done',
          id: req.id,
          report: { role: 'r', mode: 'model', requirements: [row('a'), row('b')], coverage: { covered: 0, mustHaves: 2 } },
          stats: { firstRowMs: 900, totalMs: 3000, tokensPerSecond: 40, promptTokens: 2000, completionTokens: 150 },
        });
        return;
    }
  };

  it('does not start a worker until the first call', async () => {
    const { create, workers } = factory(happy);
    const session = createLocalFitSession({ createWorker: create });
    expect(workers).toHaveLength(0);
    await session.bench();
    expect(workers).toHaveLength(1);
  });

  it('bench → load → run, streaming rows and progress', async () => {
    const { create } = factory(happy);
    const session = createLocalFitSession({ createWorker: create });
    const states: string[] = [];
    // One notification per state change (progress, each row); record phase changes.
    session.subscribe((s) => {
      if (states.at(-1) !== s.phase) states.push(s.phase);
    });

    const bench = await session.bench();
    expect(bench.verdict).toEqual({ ok: true, seconds: 4 });

    const progress = vi.fn();
    await expect(session.load(progress)).resolves.toEqual({ fromCache: false, elapsedMs: 5 });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ fraction: 0.5 }));

    const rows: string[] = [];
    const report = await session.run('jd', (r, i) => rows.push(`${i}:${r.text}`));
    expect(rows).toEqual(['0:a', '1:b']);
    expect(report.requirements).toHaveLength(2);
    expect(session.state.stats?.firstRowMs).toBe(900);
    expect(states).toEqual(['benching', 'benched', 'loading', 'ready', 'running', 'done']);
  });

  it('too_slow rejects and latches in sessionStorage; the next run refuses up front', async () => {
    const { create, workers } = factory((req, reply) => {
      if (req.type === 'run') reply({ type: 'too_slow', id: req.id, elapsedMs: 15_000 });
    });
    const session = createLocalFitSession({ createWorker: create });
    await expect(session.run('jd')).rejects.toMatchObject({ code: 'too_slow' });
    expect(sessionStorage.getItem(TOO_SLOW_KEY)).toBe('1');
    await expect(session.run('jd')).rejects.toBeInstanceOf(LocalFitError);
    expect(workers[0].sent.filter((m) => m.type === 'run')).toHaveLength(1);
  });

  it('errors reject with the worker code', async () => {
    const { create } = factory((req, reply) => {
      if (req.type === 'load') reply({ type: 'error', id: req.id, code: 'quota', message: 'QuotaExceededError' });
    });
    const session = createLocalFitSession({ createWorker: create });
    await expect(session.load()).rejects.toMatchObject({ code: 'quota', message: 'QuotaExceededError' });
    expect(session.state.phase).toBe('error');
  });

  it('cancel sends one cancel message and the pending call rejects as cancelled', async () => {
    let pendingRunId = -1;
    const { create, workers } = factory((req, reply) => {
      if (req.type === 'run') pendingRunId = req.id;
      if (req.type === 'cancel') reply({ type: 'cancelled', id: pendingRunId });
    });
    const session = createLocalFitSession({ createWorker: create });
    const run = session.run('jd');
    await Promise.resolve();
    session.cancel();
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers[0].sent.map((m) => m.type)).toEqual(['run', 'cancel']);
  });

  it('dispose terminates the worker and rejects anything pending', async () => {
    const { create, workers } = factory(() => {});
    const session = createLocalFitSession({ createWorker: create });
    const load = session.load();
    session.dispose();
    await expect(load).rejects.toMatchObject({ code: 'disposed' });
    expect(workers[0].terminated).toBe(true);
    await expect(session.bench()).rejects.toMatchObject({ code: 'disposed' });
  });

  it('a worker that fails to start rejects the call', async () => {
    const session = createLocalFitSession({
      createWorker: () => {
        throw new Error('no module workers');
      },
    });
    await expect(session.bench()).rejects.toMatchObject({ code: 'worker_failed' });
  });
});
