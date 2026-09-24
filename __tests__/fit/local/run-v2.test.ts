import { describe, it, expect } from 'vitest';

import {
  analyzeWithDecisions,
  analyzeWithoutModel,
  buildDecisionMessages,
  decideAll,
  defaultDecision,
  judge,
  judgeRequirement,
  mergeDecisions,
  mergeOne,
  NEVER,
  prepareExtraction,
  priorityApplies,
  proposeSkills,
  reportCoverage,
  segmentJd,
  uncertainSegments,
  validateJd,
  type ChatMessage,
  type QuestionMode,
  type Requirement,
  type Thresholds,
} from '@/lib/fit';
import type { FromWorker } from '@/lib/fit/local/protocol';
import type { AskResult, RunDeps, RunEngine } from '@/lib/fit/local/run';
import { runQuestions } from '@/lib/fit/local/run-v2';

import { FIXTURE_NOW, FIXTURES } from '../fixtures';

/**
 * The v2 run (one yes/no question per call) through the shared skeleton,
 * with a scripted engine whose P(yes) is a hash of the question: the same
 * guarantees as v1 (streamed rows = the final report), plus v2's own:
 * `decideAll(seg, answers)` replays the run's decisions exactly, and τ = 1
 * reproduces the no-model report.
 */

function hash(text: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** P(yes) per question from a hash; some exactly 0 or 1; some with no yes/no token at all. */
function scriptedAsk(seed: number, opts: { garble?: number } = {}) {
  const calls: ChatMessage[][] = [];
  let interrupted = false;
  const engine: RunEngine & { calls: typeof calls; interrupted: () => boolean } = {
    async *stream() {
      throw new Error('v2 never streams');
    },
    async ask(messages): Promise<AskResult> {
      calls.push(messages);
      await Promise.resolve();
      const r = hash(messages[1].content, seed);
      if (opts.garble !== undefined && r < opts.garble) return { top: [{ token: '"', logprob: 0 }], usage: { prompt_tokens: 60 } };
      const p = r < 0.1 ? 0 : r > 0.9 ? 1 : hash(messages[1].content, seed + 1);
      return {
        top: [
          { token: 'yes', logprob: Math.log(p) },
          { token: 'no', logprob: Math.log(1 - p) },
        ],
        usage: { prompt_tokens: 60 + (messages[1].content.length >> 2) },
      };
    },
    interrupt() {
      interrupted = true;
    },
    calls,
    interrupted: () => interrupted,
  };
  return engine;
}

function depsFor(engine: RunEngine, posted: FromWorker[], extra: Partial<RunDeps> = {}): RunDeps {
  let t = 0;
  return {
    engine,
    post: (m) => posted.push(m),
    validateJd,
    segmentJd,
    buildMessages: buildDecisionMessages,
    defaultDecision,
    mergeOne,
    mergeDecisions,
    prepareExtraction,
    judgeRequirement: (req) => judgeRequirement(req, undefined, FIXTURE_NOW),
    judge: (x) => judge(x, undefined, FIXTURE_NOW),
    reportCoverage,
    now: () => (t += 5),
    ...extra,
  };
}

async function run(jd: string, engine: RunEngine, opts: { questions?: QuestionMode; thresholds?: Thresholds } = {}) {
  const posted: FromWorker[] = [];
  await runQuestions(1, jd, depsFor(engine, posted), opts).done;
  const done = posted.at(-1);
  if (done?.type !== 'done') throw new Error(`run did not finish: ${JSON.stringify(done)}`);
  const rows = posted.flatMap((m) => (m.type === 'row' ? [m] : []));
  rows.forEach((m, i) => expect(m.index).toBe(i));
  return { rows: rows.map((m) => m.row), done, posted };
}

function expectStreamEqualsFinal(rows: Requirement[], final: Requirement[]) {
  expect(rows).toHaveLength(final.length);
  rows.forEach((row, i) => {
    expect({ ...row, priority: final[i].priority }).toEqual(final[i]);
    if (row.priority !== final[i].priority) expect([row.priority, final[i].priority]).toEqual(['nice', 'must']);
  });
}

const LONG_JD = [
  'Staff Platform Engineer',
  'Requirements:',
  ...Array.from({ length: 30 }, (_, i) => `- ${['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'PostgreSQL'][i % 6]} experience, area ${i + 1}`),
  'Nice to have:',
  ...Array.from({ length: 12 }, (_, i) => `- ${['Go', 'Kubernetes', 'Rust', 'Terraform'][i % 4]} exposure, topic ${i + 1}`),
].join('\n');

const JDS = [...FIXTURES.map((f) => [f.name, f.jd] as const), ['long-over-cap', LONG_JD] as const];
const LOW: Thresholds = { keep: 0.5, drop: 0.5, priority: 0.5, skill: 0.5 };

describe('runQuestions: streamed rows = the final report = a replay of its answers', () => {
  it.each(JDS)('%s: 3 modes × 4 seeds × 2 threshold sets', async (_name, jd) => {
    const seg = segmentJd(jd.trim());
    for (const questions of ['routed', 'eager', 'all'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        for (const thresholds of [LOW, undefined]) {
          const { rows, done } = await run(jd, scriptedAsk(seed, { garble: seed === 4 ? 0.1 : undefined }), { questions, thresholds });
          const decisions = done.decisions!;
          expect(done.report).toEqual({ ...analyzeWithDecisions(jd, decisions, FIXTURE_NOW), mode: 'model' });
          expectStreamEqualsFinal(rows, done.report.requirements);
          // Offline replay (the sweep) reproduces the runtime's decisions.
          expect(decideAll(seg, done.answers!, thresholds).map((t) => t.decision)).toEqual(decisions);
          expect(done.stats).toMatchObject({ strategy: 'v2', candidates: seg.candidates.length, questionsAsked: done.answers!.length });
        }
      }
    }
  });

  it('routed mode asks only what the rules need; all mode asks every requirement question', async () => {
    for (const f of FIXTURES) {
      const seg = segmentJd(f.jd);
      const routed = new Set(uncertainSegments(seg));
      const proposals = seg.candidates.reduce((n, i) => n + proposeSkills(seg.segments[i]).length, 0);
      const { done } = await run(f.jd, scriptedAsk(9), { questions: 'routed' });
      const byKind = (kind: string) => done.answers!.filter((a) => a.kind === kind);
      expect(byKind('skill')).toHaveLength(proposals);
      expect(byKind('requirement').map((a) => a.index)).toEqual([...routed]);
      for (const a of byKind('priority')) {
        const pos = seg.candidates.indexOf(a.index);
        expect(routed.has(a.index)).toBe(true);
        expect(priorityApplies(seg.segments[a.index], done.decisions![pos].requirement)).toBe(true);
      }
      const all = await run(f.jd, scriptedAsk(9), { questions: 'all' });
      expect(all.done.answers!.filter((a) => a.kind === 'requirement').map((a) => a.index)).toEqual(seg.candidates);
      // Asking more never changes the decisions.
      expect(all.done.decisions).toEqual(done.decisions);
    }
  });

  it.each(FIXTURES)('$name: τ = 1 gives the no-model report', async (f) => {
    const { done } = await run(f.jd, scriptedAsk(5), { thresholds: NEVER });
    expect({ ...done.report, mode: 'scan' }).toEqual(analyzeWithoutModel(f.jd, FIXTURE_NOW));
    expect(done.stats.overrides).toEqual({ keep: 0, drop: 0, priority: 0, skills: 0 });
  });
});

describe('runQuestions: records and stats', () => {
  it('one record per question, with the segment, kind, skill, P(yes), latency and prefill tokens', async () => {
    const jd = FIXTURES.find((f) => f.name === 'boilerplate-payments')!.jd;
    const engine = scriptedAsk(2, { garble: 0.2 });
    const { done } = await run(jd, engine);
    expect(engine.calls).toHaveLength(done.answers!.length);
    for (const a of done.answers!) {
      expect(a.ms).toBe(5);
      expect(a.promptTokens).toBeGreaterThanOrEqual(60);
      if (a.kind === 'skill') expect(a.skill).toBeDefined();
      else expect(a.skill).toBeUndefined();
    }
    const nulls = done.answers!.filter((a) => a.pYes === null).length;
    expect(done.stats.unanswered).toBe(nulls);
    expect(done.stats.questionMs).toEqual({ median: 5, max: 5 });
    expect(done.stats.completionTokens).toBe(done.answers!.length);
  });

  it('every question is one line, with the shared system prompt', async () => {
    const engine = scriptedAsk(3);
    await run(FIXTURES[0].jd, engine);
    const systems = new Set(engine.calls.map((m) => m[0].content));
    expect(systems.size).toBe(1);
    for (const m of engine.calls) expect(m).toHaveLength(2);
  });

  it('an engine without ask() is an error, not a silent no-model run', async () => {
    const posted: FromWorker[] = [];
    const engine: RunEngine = { async *stream() {}, interrupt() {} };
    await runQuestions(1, FIXTURES[0].jd, depsFor(engine, posted)).done;
    expect(posted.at(-1)).toMatchObject({ type: 'error', code: 'internal' });
  });

  it('cancel between questions stops asking and posts cancelled, never done', async () => {
    const posted: FromWorker[] = [];
    const engine = scriptedAsk(1);
    const ask = engine.ask!.bind(engine);
    let handle: ReturnType<typeof runQuestions> | null = null;
    engine.ask = async (m, o) => {
      if (engine.calls.length === 3) handle!.cancel();
      return ask(m, o);
    };
    handle = runQuestions(4, FIXTURES[5].jd, depsFor(engine, posted));
    await handle.done;
    expect(posted.at(-1)).toEqual({ type: 'cancelled', id: 4 });
    expect(posted.some((m) => m.type === 'done')).toBe(false);
    expect(engine.calls.length).toBeLessThanOrEqual(4);
    expect(engine.interrupted()).toBe(true);
  });

  it('the watchdog fires when the first decision takes longer than the budget', async () => {
    const posted: FromWorker[] = [];
    let fire: (() => void) | null = null;
    const engine = scriptedAsk(1);
    const ask = engine.ask!.bind(engine);
    engine.ask = async (m, o) => {
      fire?.();
      return ask(m, o);
    };
    await runQuestions(
      2,
      FIXTURES[5].jd,
      depsFor(engine, posted, {
        setTimer: (fn) => {
          fire = fn;
          return 1;
        },
        clearTimer: () => {
          fire = null;
        },
      }),
    ).done;
    expect(posted.at(-1)).toMatchObject({ type: 'too_slow', id: 2 });
  });
});
