import type { FitReport, Requirement, SegmentDecision } from '@/lib/fit/contract';

import type { LocalModelId } from './model';

/**
 * THE WORKER PROTOCOL — every message between `client.ts` (main thread) and
 * `worker.ts` (the dedicated worker that owns WebGPU and WebLLM).
 *
 * Types only, plus two pure functions (`reduceSession`, `toLoadProgress`), so
 * both sides and the tests can import it without pulling in WebLLM.
 *
 * Requests carry an `id`; every response to that request echoes it, so a
 * late message from a cancelled run can never be mistaken for the next one.
 * One request runs at a time per worker; a second one gets `error: busy`.
 */

// ---------------------------------------------------------------- requests

export type ToWorker =
  | { type: 'probe'; id: number }
  | { type: 'bench'; id: number }
  /**
   * `modelId` picks another pinned model from `LOCAL_MODELS` (the dev
   * harness and the model comparison use it); omitted → `LOCAL_MODEL_ID`.
   */
  | { type: 'load'; id: number; modelId?: LocalModelId }
  | { type: 'run'; id: number; jd: string }
  /**
   * Cancels whatever is in flight (a load or a run). The reply is `cancelled`
   * carrying the id of the request it stopped.
   */
  | { type: 'cancel' };

// ---------------------------------------------------------------- payloads

export interface ProbeResult {
  supported: boolean;
  /** Why not, when `supported` is false. */
  reason?: ProbeFailure;
  adapter?: {
    vendor: string;
    architecture: string;
    description: string;
    isFallbackAdapter: boolean;
  };
  limits?: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
    maxStorageBuffersPerShaderStage: number;
  };
  features?: string[];
}

export type ProbeFailure =
  | 'no-worker' // the browser cannot start a module worker
  | 'no-webgpu-in-worker' // `navigator.gpu` is missing in WorkerGlobalScope
  | 'no-adapter' // requestAdapter() returned null or threw
  | 'fallback-adapter' // a software adapter (SwiftShader, WARP): far too slow
  | 'no-shader-f16'
  | 'limits' // buffer / binding / workgroup limits below the model's needs
  | 'timeout' // the probe did not answer in time
  | 'disabled'; // Private mode is switched off for this build (see PRIVATE_MODE_ENABLED)

export interface BenchResult {
  /** Measured tiled-matmul throughput, GFLOP/s. */
  gflops: number;
  /** Measured matrix-vector streaming bandwidth, GB/s. */
  gbps: number;
  /** Wall time the benchmark itself took. */
  elapsedMs: number;
  /** Estimated ms from `run` to the first row (see bench.ts for the formula). */
  estimatedFirstRowMs: number;
}

export type LoadPhase = 'download' | 'cache' | 'compile' | 'init';

export interface LoadProgress {
  phase: LoadPhase;
  /** 0..1 within the phase. */
  fraction: number;
  /** Bytes of weights fetched (download) or read from cache (cache). */
  loadedBytes: number;
  totalBytes: number;
  /** WebLLM's own status line, for a details disclosure. */
  text: string;
}

export interface RunStats {
  firstRowMs: number | null;
  totalMs: number;
  /** Output tokens / decode seconds, when WebLLM reports usage. */
  tokensPerSecond: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  /** WebLLM's own breakdown (usage.extra), when reported. Seconds → ms. */
  prefillTokensPerSecond?: number | null;
  timeToFirstTokenMs?: number | null;
  grammarInitMs?: number | null;
  grammarPerTokenMs?: number | null;
  /** Candidate segments the model was asked about (0 → the model never ran). */
  candidates?: number;
  /**
   * How many of those decisions came from the model. Less than `candidates`
   * when its output was truncated or malformed: the rest used
   * `defaultDecision`, and the report says so here rather than failing.
   */
  decidedByModel?: number;
  /** Time to the first complete decision (the watchdog's signal of progress). */
  firstDecisionMs?: number | null;
}

export type ErrorCode =
  | 'busy'
  | 'invalid_jd'
  | 'not_loaded'
  | 'no_webgpu'
  | 'load_failed'
  | 'quota' // storage quota exceeded while caching weights
  | 'device_lost'
  | 'invalid_output' // the model's JSON did not match the contract
  | 'internal';

// ---------------------------------------------------------------- responses

export type FromWorker =
  | { type: 'probe_result'; id: number; result: ProbeResult }
  | { type: 'bench_result'; id: number; result: BenchResult }
  | { type: 'progress'; id: number; progress: LoadProgress }
  | { type: 'loaded'; id: number; fromCache: boolean; elapsedMs: number }
  /** One finished, judged requirement, in extraction order. */
  | { type: 'row'; id: number; index: number; row: Requirement }
  | {
      type: 'done';
      id: number;
      report: FitReport;
      stats: RunStats;
      /** One per candidate segment, in order, as used for the report (model's or default). */
      decisions?: SegmentDecision[];
    }
  /** The watchdog fired: no first row within the budget. Generation stopped. */
  | { type: 'too_slow'; id: number; elapsedMs: number }
  | { type: 'cancelled'; id: number }
  | { type: 'error'; id: number; code: ErrorCode; message: string };

// ---------------------------------------------------------------- session

/**
 * A UI-friendly view of one worker session, folded from its messages. The
 * client keeps one; the /fit page can render straight from it.
 */
export interface SessionState {
  phase:
    | 'idle'
    | 'benching'
    | 'benched'
    | 'loading'
    | 'ready'
    | 'running'
    | 'done'
    | 'too_slow'
    | 'cancelled'
    | 'error';
  bench: BenchResult | null;
  progress: LoadProgress | null;
  rows: Requirement[];
  report: FitReport | null;
  stats: RunStats | null;
  error: { code: ErrorCode; message: string } | null;
  /** Id of the request whose messages are accepted; others are stale. */
  activeId: number | null;
  /** Whether the model is in GPU memory (survives run → done → run). */
  loaded: boolean;
  /** The last run's per-segment decisions (evals and the dev harness read them). */
  decisions?: SegmentDecision[] | null;
}

export const INITIAL_SESSION: SessionState = {
  phase: 'idle',
  bench: null,
  progress: null,
  rows: [],
  report: null,
  stats: null,
  error: null,
  activeId: null,
  loaded: false,
};

/** What the client does when it SENDS a request (so stale replies drop). */
export function startRequest(state: SessionState, request: ToWorker): SessionState {
  switch (request.type) {
    case 'bench':
      return { ...state, phase: 'benching', activeId: request.id, error: null };
    case 'load':
      return { ...state, phase: 'loading', activeId: request.id, progress: null, error: null };
    case 'run':
      return {
        ...state,
        phase: 'running',
        activeId: request.id,
        rows: [],
        report: null,
        stats: null,
        decisions: null,
        error: null,
      };
    default:
      return state;
  }
}

/** Folds one worker message into the session. Pure. */
export function reduceSession(state: SessionState, msg: FromWorker): SessionState {
  if (msg.id !== state.activeId) return state; // stale: a cancelled request
  switch (msg.type) {
    case 'bench_result':
      return { ...state, phase: 'benched', bench: msg.result };
    case 'progress':
      return { ...state, progress: msg.progress };
    case 'loaded':
      return { ...state, phase: 'ready', loaded: true };
    case 'row': {
      // Rows arrive in order; an out-of-order or repeated index is ignored.
      if (msg.index !== state.rows.length) return state;
      return { ...state, rows: [...state.rows, msg.row] };
    }
    case 'done':
      return {
        ...state,
        phase: 'done',
        report: msg.report,
        stats: msg.stats,
        decisions: msg.decisions ?? null,
        activeId: null,
      };
    case 'too_slow':
      return { ...state, phase: 'too_slow', activeId: null };
    case 'cancelled':
      // A cancelled load leaves nothing in memory; a cancelled run keeps it.
      return { ...state, phase: state.loaded ? 'ready' : 'cancelled', activeId: null };
    case 'error':
      return {
        ...state,
        phase: 'error',
        error: { code: msg.code, message: msg.message },
        activeId: null,
        loaded: msg.code === 'device_lost' || msg.code === 'load_failed' ? false : state.loaded,
      };
    case 'probe_result':
      return state;
  }
}

// ---------------------------------------------------------------- progress

/**
 * WebLLM's `InitProgressReport` is `{ progress, timeElapsed, text }` with no
 * byte counts (0.2.85). The phase is only recoverable from `text`, whose
 * prefixes come from its tensor-cache loader:
 *   "Fetching param cache[i/n]: …"       → downloading weights
 *   "Loading model from cache[i/n]: …"   → weights already cached, uploading
 *   "Loading GPU shader modules[i/n]: …" → compiling WGSL pipelines
 * and `progress` is fetchedBytes / totalBytes within the weights phases, so
 * bytes = progress × the model's known shard total.
 */
export function toLoadProgress(
  report: { progress: number; text: string },
  totalBytes: number,
): LoadProgress {
  const fraction = Number.isFinite(report.progress) ? Math.min(1, Math.max(0, report.progress)) : 0;
  let phase: LoadPhase = 'init';
  if (report.text.startsWith('Fetching param cache') || report.text.startsWith('Start to fetch params')) {
    phase = 'download';
  } else if (report.text.startsWith('Loading model from cache')) {
    phase = 'cache';
  } else if (report.text.startsWith('Loading GPU shader modules')) {
    phase = 'compile';
  }
  const bytesPhase = phase === 'download' || phase === 'cache';
  return {
    phase,
    fraction,
    loadedBytes: bytesPhase ? Math.round(fraction * totalBytes) : phase === 'compile' ? totalBytes : 0,
    totalBytes,
    text: report.text,
  };
}
