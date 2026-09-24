import {
  MAX_REQUIREMENTS,
  SegmentDecision,
  type ChatMessage,
  type Extraction,
  type ExtractedRequirement,
  type FitReport,
  type Requirement,
  type Segment,
  type SegmentedJd,
} from '@/lib/fit/contract';

import { FIRST_ROW_BUDGET_MS } from './gate';
import { decisionsGrammar, decisionsMaxTokens } from './grammar';
import { createArrayItemExtractor } from './json-stream';
import type { ErrorCode, FromWorker, RunStats } from './protocol';

/**
 * ONE PRIVATE-MODE RUN, independent of WebLLM — the worker's logic with the
 * engine, clock and fit functions injected, so vitest can drive it with a
 * scripted fake engine (worker.ts adapts the real `MLCEngine` to `RunEngine`).
 *
 * Plan v4, "code first, model last" (Phase 2a):
 *
 *   validate JD → segmentJd (code: sections, priorities, skills, years, role)
 *     → n = candidates.length
 *     → n = 0: no model at all; the report is the code-only merge (below)
 *     → else stream {"decisions":[…exactly n…]} (temperature 0, decisionsGrammar(n))
 *         → each completed decision k: mergeOne → prepare/dedupe → judgeRequirement → `row`
 *     → end: fill any undecided candidates with defaultDecision
 *     → `done` with judge(mergeDecisions(seg, decisions)), mode 'model',
 *       coverage by `reportCoverage` (= analyzeWithDecisions)
 *
 * STREAMED ROWS = FINAL ROWS. The final report is
 * `judge(mergeDecisions(seg, decisions))`: mergeOne per decision, then
 * `capRequirements` (at most MAX_REQUIREMENTS, must-haves before
 * nice-to-haves, kept in document order), then judge's `prepareExtraction`
 * (clip, dedupe keeping the first position), then `judgeRequirement` per row.
 * The stream runs the same steps on what's decided so far:
 *
 * - The cap is the only step that can remove an earlier row, so a merged row
 *   is posted only once it is CERTAIN to survive it (`capFate`): a must-have
 *   survives iff fewer than MAX_REQUIREMENTS must-haves precede it; a
 *   nice-to-have iff all must-haves plus the nice-to-haves before it stay
 *   under the cap, counting every undecided candidate that could still turn
 *   out a must-have. Rows are posted strictly in order, so an uncertain row
 *   holds back the ones after it until later decisions (or the end) settle
 *   it. Below the cap — every JD with ≤ 25 candidates — nothing is held.
 * - The certain survivors go through the real `prepareExtraction`; since
 *   dedupe keeps first positions, it can only append rows. The one
 *   exception: a later must-have duplicate upgrades an earlier `nice` row to
 *   `must`. A posted row can't change, so there the `done` report
 *   (authoritative, as before) differs from the streamed row in priority
 *   only.
 *
 * run.test.ts holds these properties against the real pipeline.
 *
 * FALLBACK, NOT FAILURE. The grammar makes a short or malformed output
 * nearly impossible, but `max_tokens` can still cut it, and a single item
 * could still fail the contract. Either way the run doesn't fail: every
 * candidate without a valid model decision gets `defaultDecision` (the scan
 * path's rule for that segment), and `stats.decidedByModel` says how many of
 * `stats.candidates` the model actually decided. Engine failures (device
 * lost, WebGPU errors) are still errors.
 *
 * NO CANDIDATES → NO MODEL. When code finds nothing to ask about (every
 * segment is about/benefits, or the JD is one short line), the run never
 * touches the engine and reports `judge(mergeDecisions(seg, []))` with mode
 * 'model' and coverage null (no must-haves): the visitor asked for Private
 * mode, the pipeline ran, and there was simply nothing for the model to
 * decide. `stats.candidates` is 0.
 *
 * WATCHDOG (gate step 6): the 15 s budget is unchanged, but it is disarmed by
 * the first complete DECISION, not the first row: in v4 the first segments
 * are often duties or blurbs the model correctly drops, which post no row,
 * and dropping them quickly is progress. What the watchdog guards against is
 * a device too slow to prefill the prompt and emit one item, and that is
 * exactly what the first decision measures. `stats.firstRowMs` still reports
 * the first row.
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

/** Normalised result of the fit module's `validateJd`. */
export type JdCheck = { ok: true; jd: string } | { ok: false; message: string };

export interface RunDeps {
  engine: RunEngine;
  post(msg: FromWorker): void;
  validateJd(jd: string): JdCheck;
  segmentJd(jd: string): SegmentedJd;
  buildMessages(seg: SegmentedJd): ChatMessage[];
  defaultDecision(segment: Segment): SegmentDecision;
  mergeOne(seg: SegmentedJd, candidatePos: number, decision: SegmentDecision): ExtractedRequirement | null;
  mergeDecisions(seg: SegmentedJd, decisions: SegmentDecision[]): Extraction;
  /** Clip, cap, dedupe (judge.ts). The same function `judge` runs first. */
  prepareExtraction(extraction: Extraction): Extraction;
  judgeRequirement(req: ExtractedRequirement): Requirement;
  judge(extraction: Extraction): FitReport;
  /** The report's coverage rule (analyze.ts `reportCoverage`), shared with the no-model path. */
  reportCoverage(rows: readonly Requirement[]): FitReport['coverage'];
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  firstRowBudgetMs?: number;
}

export interface RunHandle {
  done: Promise<void>;
  /** Stop generating; posts `cancelled` unless the run already ended. */
  cancel(): void;
}

/** Parses one streamed decision item against the contract; null if it fails. */
export function parseDecision(raw: string): SegmentDecision | null {
  try {
    const parsed = SegmentDecision.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function runExtraction(id: number, jd: string, deps: RunDeps): RunHandle {
  const now = deps.now ?? (() => performance.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const budget = deps.firstRowBudgetMs ?? FIRST_ROW_BUDGET_MS;

  const started = now();
  let ended = false;
  let firstRowMs: number | null = null;
  let firstDecisionMs: number | null = null;
  let watchdog: unknown = null;

  const disarm = () => {
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null;
  };

  const end = (msg: FromWorker) => {
    if (ended) return;
    ended = true;
    disarm();
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

    let seg: SegmentedJd;
    try {
      seg = deps.segmentJd(check.jd);
    } catch (err) {
      end({ type: 'error', id, code: 'internal', message: errorMessage(err) });
      return;
    }
    const n = seg.candidates.length;

    // ---- rows, incrementally, with the final report's own steps ----------
    const decisions: SegmentDecision[] = [];
    let decidedByModel = 0;
    /** mergeOne's rows so far, in document order (before the cap). */
    const merged: ExtractedRequirement[] = [];
    /** How many of `merged` the cap question has been settled for. */
    let settled = 0;
    let mustsSettled = 0;
    let nicesSettled = 0;
    /** Settled rows that survive the cap: a prefix of the final capped list. */
    const survivors: ExtractedRequirement[] = [];
    let rowCount = 0;
    let streaming = true;

    /** Undecided candidates that could still merge as must-haves. */
    const couldBeMust = (fromPos: number) => {
      let count = 0;
      for (let pos = fromPos; pos < n; pos++) {
        if (seg.segments[seg.candidates[pos]].priority !== 'nice') count++;
      }
      return count;
    };

    const flush = () => {
      if (!streaming) return;
      const mustsKnown = merged.filter((r) => r.priority === 'must').length;
      const pending = couldBeMust(decisions.length);
      while (settled < merged.length) {
        const fate = capFate(merged[settled].priority, mustsSettled, nicesSettled, mustsKnown, pending);
        if (fate === 'unknown') break;
        if (merged[settled].priority === 'must') mustsSettled++;
        else nicesSettled++;
        if (fate === 'kept') survivors.push(merged[settled]);
        settled++;
      }
      let prepared: Extraction;
      try {
        prepared = deps.prepareExtraction({ role: seg.role, requirements: survivors });
      } catch {
        // A row the contract rejects: the final judge fails the same way.
        // Stop streaming; `done` (or the error) decides.
        streaming = false;
        return;
      }
      while (rowCount < prepared.requirements.length) {
        const row = deps.judgeRequirement(prepared.requirements[rowCount]);
        if (firstRowMs === null) firstRowMs = now() - started;
        deps.post({ type: 'row', id, index: rowCount++, row });
      }
    };

    const accept = (decision: SegmentDecision, fromModel: boolean) => {
      const k = decisions.length;
      if (k >= n) return;
      decisions.push(decision);
      if (fromModel) decidedByModel++;
      if (firstDecisionMs === null) {
        firstDecisionMs = now() - started;
        disarm();
      }
      const req = deps.mergeOne(seg, k, decision);
      if (req) merged.push(req);
      flush();
    };

    let usage: StreamChunk['usage'];

    if (n > 0) {
      watchdog = setTimer(() => {
        if (ended || firstDecisionMs !== null) return;
        deps.engine.interrupt();
        end({ type: 'too_slow', id, elapsedMs: now() - started });
      }, budget);

      const extractor = createArrayItemExtractor('decisions');
      try {
        const stream = deps.engine.stream(deps.buildMessages(seg), {
          grammar: decisionsGrammar(n),
          maxTokens: decisionsMaxTokens(n),
        });
        for await (const chunk of stream) {
          if (ended) break;
          if (chunk.usage) usage = chunk.usage;
          if (!chunk.delta) continue;
          for (const raw of extractor.push(chunk.delta)) {
            if (decisions.length >= n) break;
            const decision = parseDecision(raw);
            const k = decisions.length;
            if (decision) accept(decision, true);
            else accept(deps.defaultDecision(seg.segments[seg.candidates[k]]), false);
          }
        }
      } catch (err) {
        if (ended) return; // interrupted by cancel or the watchdog
        end({ type: 'error', id, code: classifyError(err), message: errorMessage(err) });
        return;
      }
      if (ended) return;
    }

    // Truncated or short output: code decides the rest (see the header).
    while (decisions.length < n) {
      accept(deps.defaultDecision(seg.segments[seg.candidates[decisions.length]]), false);
    }

    let report: FitReport;
    try {
      // = analyzeWithDecisions(jd, decisions), in model mode. With no
      // candidates there are no must-haves, so coverage is null.
      const judged = deps.judge(deps.mergeDecisions(seg, decisions));
      report = { ...judged, mode: 'model', coverage: deps.reportCoverage(judged.requirements) };
    } catch (err) {
      end({ type: 'error', id, code: 'internal', message: errorMessage(err) });
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
      candidates: n,
      decidedByModel,
      firstDecisionMs,
    };
    end({ type: 'done', id, report, stats, decisions });
  })();

  return { done, cancel };
}

/**
 * Whether a merged row survives `capRequirements` (merge.ts), given what's
 * decided so far. The cap keeps the first MAX_REQUIREMENTS rows ranked
 * must-haves first, then document order, and only applies above the cap —
 * which the rule below already implies (a row's rank is below the total).
 *
 * @param mustsBefore / nicesBefore  merged rows before this one, by priority
 * @param mustsKnown  must-have rows merged so far (anywhere)
 * @param couldBeMust undecided candidates that could still merge as must-haves
 */
export function capFate(
  priority: 'must' | 'nice',
  mustsBefore: number,
  nicesBefore: number,
  mustsKnown: number,
  couldBeMust: number,
  cap = MAX_REQUIREMENTS,
): 'kept' | 'dropped' | 'unknown' {
  if (priority === 'must') return mustsBefore < cap ? 'kept' : 'dropped';
  if (mustsKnown + nicesBefore >= cap) return 'dropped';
  if (mustsKnown + couldBeMust + nicesBefore < cap) return 'kept';
  return 'unknown';
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
