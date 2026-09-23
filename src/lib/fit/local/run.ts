import {
  MAX_REQUIREMENTS,
  type Extraction,
  type ExtractedRequirement,
  type ChatMessage,
  type FitReport,
  type Requirement,
} from '@/lib/fit/contract';

import { FIRST_ROW_BUDGET_MS } from './gate';
import { EXTRACTION_GRAMMAR } from './grammar';
import { createArrayItemExtractor } from './json-stream';
import type { ErrorCode, FromWorker, RunStats } from './protocol';

/**
 * ONE PRIVATE-MODE RUN, independent of WebLLM — the worker's logic with the
 * engine, clock and fit functions injected, so vitest can drive it with a
 * scripted fake engine (worker.ts adapts the real `MLCEngine` to `RunEngine`).
 *
 *   validate JD → build messages → stream JSON (temperature 0, grammar.ts)
 *     → each completed requirement: parse → judgeRequirement (sanitize + contract) → `row`
 *     → end: parse whole document → judge → `done`
 *
 * The watchdog (gate step 6) starts with the request: no first row within
 * FIRST_ROW_BUDGET_MS → interrupt the engine, post `too_slow`, and swallow
 * whatever the engine still emits.
 */

export interface StreamChunk {
  /** New text since the previous chunk. */
  delta: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    extra?: {
      decode_tokens_per_s?: number;
      prefill_tokens_per_s?: number;
      time_to_first_token_s?: number;
      grammar_init_s?: number;
      grammar_per_token_s?: number;
    };
  };
}

export interface RunEngine {
  stream(messages: ChatMessage[], opts: { grammar: string; maxTokens: number }): AsyncIterable<StreamChunk>;
  interrupt(): void;
}

export interface RunDeps {
  engine: RunEngine;
  post(msg: FromWorker): void;
  validateJd(jd: string): JdCheck;
  buildMessages(jd: string): ChatMessage[];
  judgeRequirement(req: ExtractedRequirement): Requirement;
  judge(extraction: Extraction): FitReport;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  firstRowBudgetMs?: number;
}

/** Normalised result of the fit module's `validateJd`. */
export type JdCheck = { ok: true; jd: string } | { ok: false; message: string };

/** 15 requirements × ~75 tokens + the role and punctuation, with headroom. */
export const MAX_OUTPUT_TOKENS = 1600;

export interface RunHandle {
  done: Promise<void>;
  /** Stop generating; posts `cancelled` unless the run already ended. */
  cancel(): void;
}

/** Same-looking rows are shown once while streaming; `done` is authoritative. */
function rowKey(req: ExtractedRequirement): string {
  return JSON.stringify([
    req.text.toLowerCase().replace(/\s+/g, ' ').trim(),
    [...req.skills].sort(),
    req.otherSkills.map((s) => s.toLowerCase()).sort(),
    req.minYears,
  ]);
}

export function runExtraction(id: number, jd: string, deps: RunDeps): RunHandle {
  const now = deps.now ?? (() => performance.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const budget = deps.firstRowBudgetMs ?? FIRST_ROW_BUDGET_MS;

  const started = now();
  let ended = false;
  let firstRowMs: number | null = null;
  let watchdog: unknown = null;

  const end = (msg: FromWorker) => {
    if (ended) return;
    ended = true;
    if (watchdog !== null) clearTimer(watchdog);
    deps.post(msg);
  };

  const cancel = () => {
    if (ended) return;
    deps.engine.interrupt();
    end({ type: 'cancelled', id });
  };

  const done = (async () => {
    const check = deps.validateJd(jd);
    if (!check.ok) {
      end({ type: 'error', id, code: 'invalid_jd', message: check.message });
      return;
    }

    watchdog = setTimer(() => {
      if (ended || firstRowMs !== null) return;
      deps.engine.interrupt();
      end({ type: 'too_slow', id, elapsedMs: now() - started });
    }, budget);

    const extractor = createArrayItemExtractor('requirements');
    const seen = new Set<string>();
    let rowCount = 0;
    let text = '';
    let usage: StreamChunk['usage'];

    try {
      const stream = deps.engine.stream(deps.buildMessages(check.jd), {
        grammar: EXTRACTION_GRAMMAR,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      for await (const chunk of stream) {
        if (ended) break;
        if (chunk.usage) usage = chunk.usage;
        if (!chunk.delta) continue;
        text += chunk.delta;
        for (const raw of extractor.push(chunk.delta)) {
          if (rowCount >= MAX_REQUIREMENTS) break;
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue; // not a well-formed item; the final parse decides
          }
          // judgeRequirement sanitizes (clips lengths, drops unknown ids —
          // the grammar leaves string lengths open, see grammar.ts) and then
          // validates against the contract, throwing on a wrong shape.
          let row: Requirement;
          try {
            row = deps.judgeRequirement(parsed as ExtractedRequirement);
          } catch {
            continue;
          }
          const key = rowKey(row);
          if (seen.has(key)) continue;
          seen.add(key);
          if (firstRowMs === null) {
            firstRowMs = now() - started;
            if (watchdog !== null) clearTimer(watchdog);
            watchdog = null;
          }
          deps.post({ type: 'row', id, index: rowCount++, row });
        }
      }
    } catch (err) {
      if (ended) return; // interrupted by cancel or the watchdog
      end({ type: 'error', id, code: classifyError(err), message: errorMessage(err) });
      return;
    }
    if (ended) return;

    let report: FitReport;
    try {
      // `judge` runs prepareExtraction: clip, dedupe, then Extraction.parse.
      report = deps.judge(JSON.parse(text) as Extraction);
    } catch (err) {
      // The tail says whether it was truncation (max_tokens) or a runaway
      // string/whitespace. It stays on the device like everything else.
      const tail = JSON.stringify(text.slice(-160));
      end({
        type: 'error',
        id,
        code: 'invalid_output',
        message: `${errorMessage(err)} (${text.length} chars; ends ${tail})`,
      });
      return;
    }

    const stats: RunStats = {
      firstRowMs,
      totalMs: now() - started,
      tokensPerSecond: usage?.extra?.decode_tokens_per_s ?? null,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      prefillTokensPerSecond: usage?.extra?.prefill_tokens_per_s ?? null,
      timeToFirstTokenMs: ms(usage?.extra?.time_to_first_token_s),
      grammarInitMs: ms(usage?.extra?.grammar_init_s),
      grammarPerTokenMs: ms(usage?.extra?.grammar_per_token_s),
    };
    end({ type: 'done', id, report, stats });
  })();

  return { done, cancel };
}

const ms = (seconds: number | undefined) => (typeof seconds === 'number' ? seconds * 1000 : null);

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Map WebLLM / WebGPU failures onto the protocol's error codes. */
export function classifyError(err: unknown): ErrorCode {
  const name = err instanceof Error ? err.name : '';
  const message = errorMessage(err);
  if (name === 'QuotaExceededError' || /quota/i.test(message)) return 'quota';
  if (name === 'DeviceLostError' || /device (was )?lost/i.test(message)) return 'device_lost';
  if (/WebGPU/i.test(name) || /webgpu/i.test(message)) return 'no_webgpu';
  if (name === 'ModelNotLoadedError' || name === 'EngineNotLoadedError') return 'not_loaded';
  return 'internal';
}
