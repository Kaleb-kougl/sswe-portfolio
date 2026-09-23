import type { FitReport, Requirement } from '@/lib/fit/contract';

import { isModelCached } from './cache';
import {
  evaluateBench,
  evaluateStorage,
  isTooSlowLatched,
  latchTooSlow,
  privateModeOffer,
  saveDataOn,
  type BenchVerdict,
  type PrivateModeOffer,
  type StorageCheck,
} from './gate';
import { LOCAL_MODEL } from './model';
import {
  INITIAL_SESSION,
  reduceSession,
  startRequest,
  type BenchResult,
  type ErrorCode,
  type FromWorker,
  type LoadProgress,
  type ProbeFailure,
  type ProbeResult,
  type RunStats,
  type SessionState,
  type ToWorker,
} from './protocol';

/**
 * PRIVATE MODE, MAIN-THREAD API — what the /fit page calls.
 *
 * Deliberately light: it imports the gate rules, the model's numbers and the
 * protocol, never WebLLM. The runtime lives in `worker.ts`, reached only
 * through `new Worker(new URL('./worker.ts', import.meta.url))`, which the
 * bundler emits as its own chunk; the page itself should still load this
 * module with a dynamic `import()` inside the Private-mode handler (plan,
 * "Load boundary"), except for `probeLocalModel`, which is small.
 *
 *   probeLocalModel()        step 1, at idle, in a throwaway probe worker
 *   isSaveDataOn()           step 2 (the React page can use useSaveData)
 *   checkStorage()           step 3, on press
 *   (consent)                step 4, the page's dialog
 *   session.bench()          step 5, before the download
 *   session.run()            step 6: the worker's watchdog; too slow → latch
 */

export { LOCAL_MODEL, LOCAL_MODEL_ID, formatBytes } from './model';
export type { BenchResult, LoadProgress, RunStats, SessionState, ProbeResult, PrivateModeOffer, StorageCheck, BenchVerdict };

export type WorkerFactory = () => Worker;

export class LocalFitError extends Error {
  constructor(
    readonly code: ErrorCode | 'too_slow' | 'cancelled' | 'disposed' | 'worker_failed',
    message: string,
  ) {
    super(message);
    this.name = 'LocalFitError';
  }
}

const defaultRuntimeWorker: WorkerFactory = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'fit-private-mode' });

const defaultProbeWorker: WorkerFactory = () =>
  new Worker(new URL('./probe-worker.ts', import.meta.url), { type: 'module', name: 'fit-probe' });

function sessionStore(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------ step 1

export interface ProbeOutcome {
  supported: boolean;
  reason?: ProbeFailure;
  probe: ProbeResult | null;
}

export const PROBE_TIMEOUT_MS = 5_000;

/** After `load`, then at idle (`requestIdleCallback`, `setTimeout` fallback). */
export function whenLoadedAndIdle(win: Window | undefined = typeof window === 'undefined' ? undefined : window): Promise<void> {
  if (!win) return Promise.resolve();
  const idle = () =>
    new Promise<void>((resolve) => {
      if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(() => resolve(), { timeout: 2_000 });
      else win.setTimeout(resolve, 200);
    });
  if (win.document.readyState === 'complete') return idle();
  return new Promise<void>((resolve) => win.addEventListener('load', () => resolve(), { once: true })).then(idle);
}

/**
 * Runs `probe` in a worker and resolves with its answer; never rejects.
 * Exposed for tests; the page calls `probeLocalModel`.
 */
export function probeInWorker(createWorker: WorkerFactory, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeOutcome> {
  return new Promise<ProbeOutcome>((resolve) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      resolve({ supported: false, reason: 'no-worker', probe: null });
      return;
    }
    let settled = false;
    const finish = (outcome: ProbeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ supported: false, reason: 'timeout', probe: null }), timeoutMs);
    worker.addEventListener('message', (event: MessageEvent<FromWorker>) => {
      const msg = event.data;
      if (msg?.type === 'probe_result' && msg.id === 1) {
        finish({ supported: msg.result.supported, reason: msg.result.reason, probe: msg.result });
      }
    });
    worker.addEventListener('error', () => finish({ supported: false, reason: 'no-worker', probe: null }));
    const request: ToWorker = { type: 'probe', id: 1 };
    worker.postMessage(request);
  });
}

let probeOnce: Promise<ProbeOutcome> | null = null;

/**
 * Gate step 1, once per page: waits for `load` + idle, asks a throwaway
 * worker whether WebGPU (in a worker) has an adapter fit for the model.
 */
export function probeLocalModel(opts: { createWorker?: WorkerFactory; timeoutMs?: number } = {}): Promise<ProbeOutcome> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return Promise.resolve({ supported: false, reason: 'no-worker', probe: null });
  }
  if (opts.createWorker) {
    return whenLoadedAndIdle().then(() => probeInWorker(opts.createWorker!, opts.timeoutMs));
  }
  probeOnce ??= whenLoadedAndIdle().then(() => probeInWorker(defaultProbeWorker, opts.timeoutMs));
  return probeOnce;
}

// ------------------------------------------------------------ steps 2, 3, 6

export function isSaveDataOn(): boolean {
  return saveDataOn(typeof navigator === 'undefined' ? undefined : navigator);
}

/** Step 3: room for the weights plus a margin — or nothing needed if cached. */
export async function checkStorage(): Promise<StorageCheck> {
  const cached = await isModelCached(LOCAL_MODEL);
  let estimate: StorageEstimate | null = null;
  try {
    estimate = (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    estimate = null;
  }
  return evaluateStorage(estimate, LOCAL_MODEL, cached);
}

export function isTooSlowThisSession(): boolean {
  return isTooSlowLatched(sessionStore());
}

/** Steps 1 + 2 + the step-6 latch → what the button should look like. */
export function getPrivateModeOffer(probe: ProbeOutcome | null, saveData = isSaveDataOn()): PrivateModeOffer {
  return privateModeOffer({
    probe: probe?.probe ?? (probe ? { supported: probe.supported, reason: probe.reason } : null),
    saveData,
    tooSlowLatched: isTooSlowThisSession(),
  });
}

// ------------------------------------------------------------ the session

export interface LocalFitSession {
  /** Current folded state (see protocol.ts `SessionState`). */
  readonly state: SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  /** Step 5. Resolves with the measurement and the ≤ 10 s verdict. */
  bench(): Promise<BenchResult & { verdict: BenchVerdict }>;
  /** Downloads (or reads from cache) and compiles the model. */
  load(onProgress?: (progress: LoadProgress) => void): Promise<{ fromCache: boolean; elapsedMs: number }>;
  /**
   * Resolves with the full report; `onRow` fires as each requirement lands.
   * Timing (first row, total, tokens/s) is on `state.stats` afterwards.
   */
  run(jd: string, onRow?: (row: Requirement, index: number) => void): Promise<FitReport>;
  /** Stops the in-flight load or run; its promise rejects with code `cancelled`. */
  cancel(): void;
  /** Terminates the worker (frees GPU memory). The session is unusable after. */
  dispose(): void;
}

interface Pending {
  resolve: (msg: FromWorker) => void;
  reject: (err: LocalFitError) => void;
  onMessage?: (msg: FromWorker) => void;
}

/** Created when the visitor presses the button; the worker starts on first use. */
export function createLocalFitSession(opts: { createWorker?: WorkerFactory; storage?: Storage } = {}): LocalFitSession {
  const createWorker = opts.createWorker ?? defaultRuntimeWorker;
  let worker: Worker | null = null;
  let disposed = false;
  let nextId = 1;
  let state: SessionState = INITIAL_SESSION;
  const listeners = new Set<(s: SessionState) => void>();
  const pending = new Map<number, Pending>();

  const setState = (next: SessionState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

  const failAll = (err: LocalFitError) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const onMessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    setState(reduceSession(state, msg));
    const p = pending.get(msg.id);
    if (!p) return;
    switch (msg.type) {
      case 'progress':
      case 'row':
        p.onMessage?.(msg);
        return;
      case 'error':
        pending.delete(msg.id);
        p.reject(new LocalFitError(msg.code, msg.message));
        return;
      case 'too_slow':
        pending.delete(msg.id);
        latchTooSlow(opts.storage ?? sessionStore());
        p.reject(new LocalFitError('too_slow', `No result after ${Math.round(msg.elapsedMs / 1000)} s.`));
        return;
      case 'cancelled':
        pending.delete(msg.id);
        p.reject(new LocalFitError('cancelled', 'Cancelled.'));
        return;
      default:
        pending.delete(msg.id);
        p.resolve(msg);
    }
  };

  const ensureWorker = (): Worker => {
    if (disposed) throw new LocalFitError('disposed', 'This session was disposed.');
    if (worker) return worker;
    try {
      worker = createWorker();
    } catch (err) {
      throw new LocalFitError('worker_failed', err instanceof Error ? err.message : String(err));
    }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', (event) => {
      failAll(new LocalFitError('worker_failed', event.message || 'The Private-mode worker failed to start.'));
    });
    return worker;
  };

  const request = <T extends FromWorker>(
    build: (id: number) => ToWorker,
    onMsg?: (msg: FromWorker) => void,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      let w: Worker;
      try {
        w = ensureWorker();
      } catch (err) {
        reject(err);
        return;
      }
      const id = nextId++;
      const req = build(id);
      pending.set(id, { resolve: resolve as (m: FromWorker) => void, reject, onMessage: onMsg });
      setState(startRequest(state, req));
      w.postMessage(req);
    });

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async bench() {
      const msg = await request<FromWorker & { type: 'bench_result' }>((id) => ({ type: 'bench', id }));
      return { ...msg.result, verdict: evaluateBench(msg.result) };
    },
    async load(onProgress) {
      const msg = await request<FromWorker & { type: 'loaded' }>(
        (id) => ({ type: 'load', id }),
        (m) => {
          if (m.type === 'progress') onProgress?.(m.progress);
        },
      );
      return { fromCache: msg.fromCache, elapsedMs: msg.elapsedMs };
    },
    async run(jd, onRow) {
      if (isTooSlowLatched(opts.storage ?? sessionStore())) {
        throw new LocalFitError('too_slow', 'Private mode was too slow on this device earlier in this session.');
      }
      const msg = await request<FromWorker & { type: 'done' }>(
        (id) => ({ type: 'run', id, jd }),
        (m) => {
          if (m.type === 'row') onRow?.(m.row, m.index);
        },
      );
      return msg.report;
    },
    cancel() {
      if (worker && pending.size > 0) worker.postMessage({ type: 'cancel' } satisfies ToWorker);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = null;
      failAll(new LocalFitError('disposed', 'This session was disposed.'));
      setState(INITIAL_SESSION);
      listeners.clear();
    },
  };
}
