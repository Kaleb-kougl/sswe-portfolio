import { describe, it, expect, vi, afterEach } from 'vitest';

import type { ExtractedRequirement } from '@/lib/fit/contract';
import { judge, judgeRequirement } from '@/lib/fit/judge';
import type { FromWorker } from '@/lib/fit/local/protocol';
import { classifyError, runExtraction, type RunDeps, type RunEngine, type StreamChunk } from '@/lib/fit/local/run';

/**
 * The worker's run logic with a scripted engine: the real stream splitting,
 * contract parsing, row posting, watchdog and final judging, minus WebGPU.
 */

const REQS: ExtractedRequirement[] = [
  { text: 'Five years of React', priority: 'must', skills: [], otherSkills: ['Elm'], minYears: 5 },
  { text: 'Kubernetes', priority: 'nice', skills: [], otherSkills: ['Kubernetes'], minYears: null },
];
const DOC = JSON.stringify({ role: 'Frontend Engineer', requirements: REQS });

/** Streams `text` in chunks of `size`, awaiting `gate` before each chunk if given. */
function scriptedEngine(text: string, size = 7, opts: { gate?: () => Promise<void>; throwAt?: number } = {}) {
  let interrupted = false;
  const engine: RunEngine & { interrupted: () => boolean } = {
    async *stream() {
      for (let i = 0; i < text.length; i += size) {
        if (opts.gate) await opts.gate();
        if (interrupted) return;
        if (opts.throwAt !== undefined && i >= opts.throwAt) throw new Error('Device was lost');
        const chunk: StreamChunk = { delta: text.slice(i, i + size) };
        yield chunk;
      }
      yield { delta: '', usage: { prompt_tokens: 900, completion_tokens: 120, extra: { decode_tokens_per_s: 42 } } };
    },
    interrupt: () => {
      interrupted = true;
    },
    interrupted: () => interrupted,
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
    buildMessages: (jd) => [{ role: 'user', content: jd }],
    // The real judging code, as the worker runs it.
    judgeRequirement: (req) => judgeRequirement(req),
    judge: (x) => judge(x),
    now: () => (t += 10),
    ...extra,
  };
  return { d, posted };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runExtraction', () => {
  it.each([1, 3, 7, 50, 10_000])('posts one row per requirement, then done (chunk size %i)', async (size) => {
    const { d, posted } = deps(scriptedEngine(DOC, size));
    await runExtraction(7, 'a JD', d).done;
    const rows = posted.filter((m) => m.type === 'row');
    expect(rows.map((m) => m.type === 'row' && [m.index, m.row.text])).toEqual([
      [0, 'Five years of React'],
      [1, 'Kubernetes'],
    ]);
    const last = posted.at(-1)!;
    expect(last.type).toBe('done');
    if (last.type !== 'done') return;
    expect(last.id).toBe(7);
    expect(last.report.role).toBe('Frontend Engineer');
    expect(last.report.requirements).toHaveLength(2);
    expect(last.stats).toMatchObject({ promptTokens: 900, completionTokens: 120, tokensPerSecond: 42 });
    expect(last.stats.firstRowMs).not.toBeNull();
  });

  it('posts a row BEFORE the rest of the document has streamed', async () => {
    const firstEnd = DOC.indexOf('},') + 1;
    const posted: FromWorker[] = [];
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
        posted.push(m);
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

  it('clips over-long strings (the grammar leaves lengths open) instead of dropping the row', async () => {
    const long = { ...REQS[1], text: 'x'.repeat(500), otherSkills: ['y'.repeat(90)] };
    const doc = JSON.stringify({ role: 'r'.repeat(300), requirements: [long] });
    const { d, posted } = deps(scriptedEngine(doc, 11));
    await runExtraction(1, 'jd', d).done;
    const rows = posted.filter((m) => m.type === 'row');
    expect(rows).toHaveLength(1);
    const last = posted.at(-1)!;
    expect(last.type).toBe('done');
    if (last.type !== 'done') return;
    expect(last.report.role.length).toBeLessThanOrEqual(120);
    expect(last.report.requirements[0].text.length).toBeLessThanOrEqual(200);
  });

  it('skips items that fail the contract, and dedupes identical rows while streaming', async () => {
    const doc = JSON.stringify({
      role: 'r',
      requirements: [REQS[0], { text: 'bad', priority: 'maybe', skills: [], otherSkills: [], minYears: null }, REQS[0], REQS[1]],
    });
    const { d, posted } = deps(scriptedEngine(doc, 5), {
      // The final document is invalid (priority "maybe"), so it ends in an error.
    });
    await runExtraction(1, 'jd', d).done;
    const rows = posted.filter((m) => m.type === 'row');
    expect(rows).toHaveLength(2);
    expect(posted.at(-1)).toMatchObject({ type: 'error', code: 'invalid_output' });
  });

  it('reports invalid_output when the stream ends mid-document (e.g. max_tokens)', async () => {
    const { d, posted } = deps(scriptedEngine(DOC.slice(0, DOC.length - 20)));
    await runExtraction(1, 'jd', d).done;
    expect(posted.filter((m) => m.type === 'row')).toHaveLength(1);
    expect(posted.at(-1)).toMatchObject({ type: 'error', code: 'invalid_output' });
  });

  it('watchdog: no first row within the budget → interrupt + too_slow, then silence', async () => {
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

  it('watchdog is disarmed once the first row lands', async () => {
    vi.useFakeTimers();
    let step = 0;
    const engine: RunEngine = {
      async *stream() {
        const cut = DOC.indexOf('},') + 2;
        yield { delta: DOC.slice(0, cut) };
        // The rest arrives much later than the first-row budget.
        await new Promise((r) => setTimeout(r, 60_000));
        step++;
        yield { delta: DOC.slice(cut) };
      },
      interrupt: vi.fn(),
    };
    const { d, posted } = deps(engine, { firstRowBudgetMs: 15_000 });
    const handle = runExtraction(1, 'jd', d);
    await vi.advanceTimersByTimeAsync(61_000);
    await handle.done;
    expect(step).toBe(1);
    expect(engine.interrupt).not.toHaveBeenCalled();
    expect(posted.at(-1)?.type).toBe('done');
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

  it('maps an engine failure to a typed error', async () => {
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
