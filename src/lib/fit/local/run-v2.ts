import {
  countOverrides,
  decide,
  priorityApplies,
  THRESHOLDS,
  type DecisionTrace,
  type QuestionMode,
  type SegmentAnswers,
  type Thresholds,
} from '@/lib/fit/abstain';
import type { ChatMessage, Segment } from '@/lib/fit/contract';
import { pYesFrom, questionMessages, YES_NO_GRAMMAR, type Question } from '@/lib/fit/questions';
import { proposeSkills, routeAll } from '@/lib/fit/route';

import type { AnswerRecord } from './protocol';
import { runWith, type Driver, type RunDeps, type RunHandle } from './run';

/**
 * MODEL + CODE v2 RUN (plan 2f): the same skeleton as v1 (`runWith`: the
 * watchdog, in-order row streaming, the fallback and the final report), with
 * a different driver. Per candidate, in document order:
 *
 *   1. skill questions, one per `proposeSkills` proposal
 *   2. the requirement question, if the segment is routed (`uncertainSegments`)
 *   3. the priority question, if it applies after 1–2 (`priorityApplies`)
 *   4. `decide` → the candidate's decision → `accept` (its row streams now)
 *
 * Each question is its own completion: a short shared system prompt, one
 * line, one yes/no token (`YES_NO_GRAMMAR`), P(yes) from its logprobs.
 * A question whose top tokens hold neither word is ignored (code decides).
 *
 * `questions` widens what is ASKED for evals (`eager`, `all`); the decision
 * always uses the routing rules, so the report is what the product shows and
 * `decideAll(seg, answers)` replays it exactly (tested).
 */

export interface V2Options {
  questions?: QuestionMode;
  thresholds?: Thresholds;
  /** Question-level extras: the messages builder (tests swap it). */
  messages?: (q: Question, segment: Segment) => ChatMessage[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

function askQuestions(deps: RunDeps, opts: V2Options): Driver {
  const mode = opts.questions ?? 'routed';
  const t = opts.thresholds ?? THRESHOLDS;
  const build = opts.messages ?? questionMessages;
  const now = deps.now ?? (() => performance.now());

  return async (ctx) => {
    const ask = deps.engine.ask?.bind(deps.engine);
    if (!ask) throw new Error('This engine cannot answer v2 questions (no ask()).');
    const { seg } = ctx;
    const routes = routeAll(seg);
    const answers: AnswerRecord[] = [];
    const traces: DecisionTrace[] = [];
    let unanswered = 0;

    const put = async (q: Question, segment: Segment): Promise<number | undefined> => {
      const t0 = now();
      const result = await ask(build(q, segment), { grammar: YES_NO_GRAMMAR });
      const pYes = pYesFrom(result.top);
      answers.push({
        index: q.index,
        kind: q.kind,
        ...(q.kind === 'skill' ? { skill: q.skill } : {}),
        pYes,
        ms: now() - t0,
        promptTokens: result.usage?.prompt_tokens ?? null,
      });
      if (pYes === null) unanswered++;
      return pYes ?? undefined;
    };

    for (const index of seg.candidates) {
      if (ctx.ended()) return;
      const segment = seg.segments[index];
      const routed = (routes.get(index)?.length ?? 0) > 0;
      const got: SegmentAnswers = {};
      const skills: { skill: (typeof segment.skills)[number]; pYes: number }[] = [];
      let asked = 0;

      for (const skill of proposeSkills(segment)) {
        const p = await put({ kind: 'skill', index, skill }, segment);
        asked++;
        if (ctx.ended()) return;
        if (p !== undefined) skills.push({ skill, pYes: p });
      }
      if (skills.length) got.skills = skills;

      if (routed || mode === 'all') {
        const p = await put({ kind: 'requirement', index }, segment);
        asked++;
        if (ctx.ended()) return;
        if (routed) got.requirement = p;
      }

      // Decisions use routing only; `all`/`eager` merely ask more.
      const provisional = decide(segment, got, t).decision;
      const askPriority =
        mode === 'routed'
          ? routed && priorityApplies(segment, provisional.requirement)
          : (routed || mode === 'all') && priorityApplies(segment, true);
      if (askPriority) {
        const p = await put({ kind: 'priority', index }, segment);
        asked++;
        if (ctx.ended()) return;
        if (routed) got.priority = p;
      }

      const trace = decide(segment, got, t);
      traces.push(trace);
      ctx.accept(trace.decision, asked > 0);
    }

    const latencies = answers.map((a) => a.ms);
    const prompts = answers.map((a) => a.promptTokens).filter((x): x is number => x !== null);
    return {
      answers,
      stats: {
        questionsAsked: answers.length,
        unanswered,
        questionMs: { median: median(latencies), max: latencies.length ? Math.max(...latencies) : null },
        questionPromptTokens: median(prompts),
        promptTokens: prompts.length ? prompts.reduce((a, b) => a + b, 0) : null,
        completionTokens: answers.length,
        overrides: countOverrides(traces),
      },
    };
  };
}

/** The v2 run: `runWith` + the question driver. */
export function runQuestions(id: number, jd: string, deps: RunDeps, opts: V2Options = {}): RunHandle {
  return runWith(id, jd, deps, askQuestions(deps, opts), 'v2');
}
