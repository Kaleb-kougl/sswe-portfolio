import { describe, it, expect, vi, afterEach } from 'vitest';

import type { Segment, SegmentDecision, SegmentedJd } from '@/lib/fit/contract';
import { judge, judgeRequirement, prepareExtraction } from '@/lib/fit/judge';
import { reportCoverage } from '@/lib/fit/analyze';
import { defaultDecision, mergeDecisions, mergeOne } from '@/lib/fit/merge';
import { decisionsMaxTokens } from '@/lib/fit/local/grammar';
import type { FromWorker } from '@/lib/fit/local/protocol';
import { classifyError, runExtraction, type RunDeps, type RunEngine, type StreamChunk } from '@/lib/fit/local/run';

/**
 * The worker's run logic with a scripted engine and a small, hand-built
 * segmentation: the real merge, stream splitting, decision parsing, row
 * posting, fallback, watchdog and final judging, minus WebGPU. The same
 * logic over real JDs (segmentJd) is in run-pipeline.test.ts.
 */

const seg = (index: number, text: string, extra: Partial<Segment> = {}): Segment => ({
  index,
  text,
  section: 'requirements',
  priority: 'must',
  skills: [],
  otherSkills: [],
  minYears: null,
  ...extra,
});

const SEG: SegmentedJd = {
  role: 'Frontend Engineer',
  segments: [
    seg(0, 'About us: we sell shoes', { section: 'about', priority: null }),
    seg(1, 'Five years of React', { skills: ['react'], minYears: 5 }),
    seg(2, 'You will attend standups', { section: 'responsibilities', priority: null }),
    seg(3, 'Kubernetes is a plus', { section: 'unknown', priority: null, otherSkills: ['Kubernetes'] }),
  ],
  candidates: [1, 2, 3],
};

const D = (requirement: boolean, priority: 'must' | 'nice' = 'must', addSkills: string[] = []): SegmentDecision => ({
  requirement,
  priority,
  addSkills,
});

/** The model's decisions for SEG: keep 1 (+typescript), drop 2, keep 3 as nice. */
const DECISIONS = [D(true, 'must', ['typescript']), D(false), D(true, 'nice')];
const DOC = JSON.stringify({ decisions: DECISIONS });

/** Streams `text` in chunks of `size`, awaiting `gate` before each chunk if given. */
function scriptedEngine(text: string, size = 7, opts: { gate?: () => Promise<void>; throwAt?: number } = {}) {
  let interrupted = false;
  const calls: { grammar: string; maxTokens: number }[] = [];
  const engine: RunEngine & { interrupted: () => boolean; calls: typeof calls } = {
    async *stream(_messages, o) {
      calls.push(o);
      for (let i = 0; i < text.length; i += size) {
        if (opts.gate) await opts.gate();
        if (interrupted) return;
        if (opts.throwAt !== undefined && i >= opts.throwAt) throw new Error('Device was lost');
        const chunk: StreamChunk = { delta: text.slice(i, i + size) };
        yield chunk;
      }
      yield { delta: '', usage: { prompt_tokens: 900, completion_tokens: 60, extra: { decode_tokens_per_s: 42 } } };
    },
    interrupt: () => {
      interrupted = true;
    },
    interrupted: () => interrupted,
    calls,
  };
  return engine;
}

function deps(engine: RunEngine, extra: Partial<RunDeps> = {}) {
  const posted: FromWorker[] = [];
  let t = 0;
  const d: RunDeps = {
    engine,
    post: (m) => posted.push(m),
    validateJd: (jd) => (jd.trim() ? { ok: true, jd } : { ok: false, message: 'Paste a job description first.' }),
    segmentJd: () => SEG,
    buildMessages: () => [{ role: 'user', content: 'decide' }],
    defaultDecision,
    mergeOne,
    mergeDecisions,
    // The real judging code, as the worker runs it.
    prepareExtraction,
    judgeRequirement: (req) => judgeRequirement(req),
    judge: (x) => judge(x),
    reportCoverage,
    now: () => (t += 10),
    ...extra,
  };
  return { d, posted };
}

const rowsOf = (posted: FromWorker[]) => posted.flatMap((m) => (m.type === 'row' ? [m] : []));
const doneOf = (posted: FromWorker[]) => {
  const last = posted.at(-1)!;
  if (last.type !== 'done') throw new Error(`expected done, got ${JSON.stringify(last)}`);
  return last;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('runExtraction (v4: one decision per candidate)', () => {
  it.each([1, 3, 7, 50, 10_000])('posts one row per kept candidate, then done (chunk size %i)', async (size) => {
    const engine = scriptedEngine(DOC, size);
    const { d, posted } = deps(engine);
    await runExtraction(7, 'a JD', d).done;
    expect(rowsOf(posted).map((m) => [m.index, m.row.text, m.row.priority, m.row.skills])).toEqual([
      [0, 'Five years of React', 'must', ['react', 'typescript']],
      [1, 'Kubernetes is a plus', 'nice', []],
    ]);
    const done = doneOf(posted);
    expect(done.id).toBe(7);
    expect(done.report.mode).toBe('model');
    expect(done.report.role).toBe('Frontend Engineer');
    expect(done.report.requirements).toEqual(rowsOf(posted).map((m) => m.row));
    expect(done.decisions).toEqual(DECISIONS);
    expect(done.stats).toMatchObject({
      promptTokens: 900,
      completionTokens: 60,
      tokensPerSecond: 42,
      candidates: 3,
      decidedByModel: 3,
    });
    expect(done.stats.firstRowMs).not.toBeNull();
    expect(done.stats.firstDecisionMs).not.toBeNull();
  });

  it('asks for exactly n decisions, with max_tokens sized from n', async () => {
    const engine = scriptedEngine(DOC);
    const { d } = deps(engine);
    await runExtraction(1, 'jd', d).done;
    expect(engine.calls).toHaveLength(1);
    const { grammar, maxTokens } = engine.calls[0];
    expect(maxTokens).toBe(decisionsMaxTokens(3));
    expect(grammar.split('\n')[0].match(/\bitem\b/g)).toHaveLength(3);
  });

  it('posts a row as soon as its decision closes, before the rest has streamed', async () => {
    const firstEnd = DOC.indexOf('},') + 1;
    let seenWhenFirstRow = -1;
    let fed = 0;
    const engine: RunEngine = {
      async *stream() {
        for (const ch of DOC) {
          fed++;
          yield { delta: ch };
        }
      },
      interrupt() {},
    };
    const { d } = deps(engine, {
      post: (m) => {
        if (m.type === 'row' && seenWhenFirstRow < 0) seenWhenFirstRow = fed;
      },
    });
    await runExtraction(1, 'jd', d).done;
    expect(seenWhenFirstRow).toBe(firstEnd);
  });

  it('rejects an invalid JD before touching the engine', async () => {
    const engine = scriptedEngine(DOC);
    const stream = vi.spyOn(engine, 'stream');
    const { d, posted } = deps(engine);
    await runExtraction(1, '   ', d).done;
    expect(stream).not.toHaveBeenCalled();
    expect(posted).toEqual([{ type: 'error', id: 1, code: 'invalid_jd', message: 'Paste a job description first.' }]);
  });

  it('no candidates → never runs the model; the code-only report, mode model', async () => {
    const engine = scriptedEngine(DOC);
    const stream = vi.spyOn(engine, 'stream');
    const empty: SegmentedJd = { ...SEG, candidates: [] };
    const { d, posted } = deps(engine, { segmentJd: () => empty });
    await runExtraction(1, 'jd', d).done;
    expect(stream).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
    const done = doneOf(posted);
    expect(done.report).toEqual({ ...judge(mergeDecisions(empty, [])), mode: 'model', coverage: null });
    expect(done.stats).toMatchObject({ candidates: 0, decidedByModel: 0, firstRowMs: null });
  });

  it('truncated output (max_tokens) → defaultDecision for the undecided rest, not an error', async () => {
    // Cut inside the third decision: two decided by the model.
    const cut = DOC.lastIndexOf('{"requirement"') + 5;
    const { d, posted } = deps(scriptedEngine(DOC.slice(0, cut)));
    await runExtraction(1, 'jd', d).done;
    const done = doneOf(posted);
    expect(done.stats).toMatchObject({ candidates: 3, decidedByModel: 2 });
    // Candidate 3 fell back to code's rule: it names Kubernetes → kept as nice.
    expect(done.decisions).toEqual([DECISIONS[0], DECISIONS[1], defaultDecision(SEG.segments[3])]);
    expect(done.report.requirements.map((r) => r.text)).toEqual(['Five years of React', 'Kubernetes is a plus']);
    // The fallback rows are streamed too, so rows still equal the report.
    expect(rowsOf(posted).map((m) => m.row)).toEqual(done.report.requirements);
  });

  it('a malformed item → defaultDecision for that candidate only', async () => {
    const doc = `{"decisions":[${JSON.stringify(DECISIONS[0])},{"requirement":"maybe","priority":"nice","addSkills":[]},${JSON.stringify(D(false))}]}`;
    const { d, posted } = deps(scriptedEngine(doc, 5));
    await runExtraction(1, 'jd', d).done;
    const done = doneOf(posted);
    expect(done.stats).toMatchObject({ candidates: 3, decidedByModel: 2 });
    expect(done.decisions).toEqual([DECISIONS[0], defaultDecision(SEG.segments[2]), D(false)]);
  });

  it('extra items beyond n are ignored', async () => {
    const doc = JSON.stringify({ decisions: [...DECISIONS, D(true), D(true)] });
    const { d, posted } = deps(scriptedEngine(doc));
    await runExtraction(1, 'jd', d).done;
    expect(doneOf(posted).decisions).toEqual(DECISIONS);
  });

  it('streamed rows go through prepareExtraction: clipped, deduped, first position kept', async () => {
    const dup: SegmentedJd = {
      role: 'r'.repeat(300),
      segments: [seg(0, 'x'.repeat(500)), seg(1, 'React'), seg(2, 'react', { skills: [] })],
      candidates: [0, 1, 2],
    };
    const doc = JSON.stringify({ decisions: [D(true), D(true), D(true)] });
    const { d, posted } = deps(scriptedEngine(doc, 9), { segmentJd: () => dup });
    await runExtraction(1, 'jd', d).done;
    const done = doneOf(posted);
    expect(done.report.role.length).toBeLessThanOrEqual(120);
    expect(rowsOf(posted).map((m) => m.row)).toEqual(done.report.requirements);
    expect(done.report.requirements).toHaveLength(2);
    expect(done.report.requirements[0].text.length).toBeLessThanOrEqual(200);
  });

  it('documented exception: a later must-have duplicate upgrades the final row, not the streamed one', async () => {
    const dup: SegmentedJd = {
      role: 'r',
      segments: [
        seg(0, 'React', { section: 'unknown', priority: null, skills: ['react'] }),
        seg(1, 'React', { skills: ['react'] }),
      ],
      candidates: [0, 1],
    };
    const doc = JSON.stringify({ decisions: [D(true, 'nice'), D(true)] });
    const { d, posted } = deps(scriptedEngine(doc), { segmentJd: () => dup });
    await runExtraction(1, 'jd', d).done;
    expect(rowsOf(posted).map((m) => m.row.priority)).toEqual(['nice']);
    expect(doneOf(posted).report.requirements.map((r) => r.priority)).toEqual(['must']);
  });

  it('watchdog: no first decision within the budget → interrupt + too_slow, then silence', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const stalled = new Promise<void>((r) => (release = r));
    const engine = scriptedEngine(DOC, 7, { gate: () => stalled });
    const { d, posted } = deps(engine, { firstRowBudgetMs: 15_000 });
    const handle = runExtraction(3, 'jd', d);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(posted).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.interrupted()).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'too_slow', id: 3 });
    release();
    await handle.done;
    expect(posted).toHaveLength(1); // nothing after too_slow
  });

  it('watchdog is disarmed by the first decision, even one that posts no row', async () => {
    vi.useFakeTimers();
    // First candidate dropped by the model: progress, but no row yet.
    const doc = JSON.stringify({ decisions: [D(false), D(true), D(true)] });
    const cut = doc.indexOf('},') + 2;
    const engine: RunEngine = {
      async *stream() {
        yield { delta: doc.slice(0, cut) };
        await new Promise((r) => setTimeout(r, 60_000));
        yield { delta: doc.slice(cut) };
      },
      interrupt: vi.fn(),
    };
    const { d, posted } = deps(engine, { firstRowBudgetMs: 15_000 });
    const handle = runExtraction(1, 'jd', d);
    await vi.advanceTimersByTimeAsync(61_000);
    await handle.done;
    expect(engine.interrupt).not.toHaveBeenCalled();
    expect(posted.at(-1)?.type).toBe('done');
    expect(rowsOf(posted)).toHaveLength(2);
  });

  it('cancel interrupts, posts cancelled once, and drops later output', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const engine = scriptedEngine(DOC, 7, { gate: () => (calls++ === 0 ? Promise.resolve() : gate) });
    const { d, posted } = deps(engine);
    const handle = runExtraction(9, 'jd', d);
    await Promise.resolve();
    handle.cancel();
    handle.cancel();
    release();
    await handle.done;
    expect(engine.interrupted()).toBe(true);
    expect(posted).toEqual([{ type: 'cancelled', id: 9 }]);
  });

  it('maps an engine failure to a typed error (no fallback for a lost device)', async () => {
    const { d, posted } = deps(scriptedEngine(DOC, 7, { throwAt: 14 }));
    await runExtraction(1, 'jd', d).done;
    expect(posted.at(-1)).toMatchObject({ type: 'error', code: 'device_lost' });
  });
});

describe('classifyError', () => {
  it('recognises the failures the UI words differently', () => {
    const named = (name: string, message = '') => Object.assign(new Error(message), { name });
    expect(classifyError(named('QuotaExceededError'))).toBe('quota');
    expect(classifyError(new Error("Failed to execute 'add' on 'Cache': Quota exceeded."))).toBe('quota');
    expect(classifyError(named('DeviceLostError'))).toBe('device_lost');
    expect(classifyError(named('WebGPUNotAvailableError'))).toBe('no_webgpu');
    expect(classifyError(new Error('something else'))).toBe('internal');
    expect(classifyError('a string')).toBe('internal');
  });
});
