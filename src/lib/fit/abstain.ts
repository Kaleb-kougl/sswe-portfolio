import type { CanonicalSkillId, Segment, SegmentDecision, SegmentedJd } from './contract';
import { defaultDecision } from './merge';
import { proposeSkills, routeAll } from './route';

/**
 * MODEL + CODE v2: ABSTAIN UNLESS CONFIDENT (plan 2f, steps 2–5).
 *
 * Code's `defaultDecision` is the answer. The model's yes/no probabilities
 * can change it only where they are confident:
 *
 * 1. Skills: a proposed skill (route.ts `proposeSkills`) is added when
 *    P(yes) > τ_skill.
 * 2. Keep/drop: code's rule is re-applied to the segment WITH those skills
 *    (a duty that now names a skill is kept as nice-to-have, as code would
 *    have if the alias scan had found it). Then, for a routed segment, the
 *    model overrides drop → keep when P(requirement) > τ_keep, and keep →
 *    drop when P(not a requirement) = 1 − P > τ_drop.
 * 3. Priority: only for a kept segment with no header priority in an
 *    unknown section (headerless prose), must when P(must) > τ_priority,
 *    nice when 1 − P > τ_priority; code's default otherwise. Responsibilities
 *    stay nice-to-have: a duty is never a must-have (merge.ts).
 *
 * Every comparison is strict, so τ = 1 can never be crossed and the output
 * is exactly `defaultDecision` (tested). Thresholds are tuned on one labelled
 * split and reported on another (evals/local/sweep.ts).
 */

export interface Thresholds {
  keep: number;
  drop: number;
  priority: number;
  skill: number;
}

/** Starting points, not tuned yet. Change only with a sweep on held-out data. */
export const THRESHOLDS: Readonly<Thresholds> = { keep: 0.9, drop: 0.9, priority: 0.9, skill: 0.9 };

/** τ = 1 everywhere: the model can never override, so v2 is the no-model path. */
export const NEVER: Readonly<Thresholds> = { keep: 1, drop: 1, priority: 1, skill: 1 };

export type QuestionKind = 'requirement' | 'priority' | 'skill';

/** One question's answer: P(yes), read from the answer token's logprobs. */
export interface Answer {
  /** Segment index (into `seg.segments`). */
  index: number;
  kind: QuestionKind;
  /** For `skill` questions: the proposed skill asked about. */
  skill?: CanonicalSkillId;
  /** Null when the answer token held neither word; ignored, as at runtime. */
  pYes: number | null;
}

/** A segment's answers, as `decide` reads them. */
export interface SegmentAnswers {
  requirement?: number;
  priority?: number;
  /** In proposal order. */
  skills?: readonly { skill: CanonicalSkillId; pYes: number }[];
}

export interface Overrides {
  /** Drop → keep. */
  keep: boolean;
  /** Keep → drop. */
  drop: boolean;
  /** Priority changed from code's default. */
  priority: boolean;
  /** Skills added. */
  skills: CanonicalSkillId[];
}

export interface DecisionTrace {
  decision: SegmentDecision;
  overrides: Overrides;
}

/**
 * Whether the priority question applies: a kept, headerless segment whose
 * priority code couldn't read from a header or cue.
 */
export function priorityApplies(segment: Segment, requirement: boolean): boolean {
  return requirement && segment.section === 'unknown' && segment.priority === null;
}

/** One segment's decision from code's rule and whatever answers exist (see the header). */
export function decide(segment: Segment, answers: SegmentAnswers, t: Thresholds = THRESHOLDS): DecisionTrace {
  const added: CanonicalSkillId[] = [];
  for (const { skill, pYes } of answers.skills ?? []) {
    if (pYes > t.skill && !segment.skills.includes(skill) && !added.includes(skill)) added.push(skill);
  }
  const base = defaultDecision(added.length ? { ...segment, skills: [...segment.skills, ...added] } : segment);

  let requirement = base.requirement;
  const overrides: Overrides = { keep: false, drop: false, priority: false, skills: added };
  if (answers.requirement !== undefined) {
    if (!requirement && answers.requirement > t.keep) {
      requirement = true;
      overrides.keep = true;
    } else if (requirement && 1 - answers.requirement > t.drop) {
      requirement = false;
      overrides.drop = true;
    }
  }

  let priority = base.priority;
  if (answers.priority !== undefined && priorityApplies(segment, requirement)) {
    const want = answers.priority > t.priority ? 'must' : 1 - answers.priority > t.priority ? 'nice' : priority;
    overrides.priority = want !== priority;
    priority = want;
  }

  // A dropped segment's additions change nothing in the report, so they don't count.
  if (!requirement) overrides.skills = [];
  return { decision: { requirement, priority, addSkills: requirement ? added : [] }, overrides };
}

/** Answers grouped per segment index, keeping proposal order for skills. */
export function groupAnswers(answers: readonly Answer[]): Map<number, SegmentAnswers> {
  const out = new Map<number, SegmentAnswers>();
  for (const a of answers) {
    if (a.pYes === null) continue;
    const g = out.get(a.index) ?? {};
    if (a.kind === 'requirement') g.requirement = a.pYes;
    else if (a.kind === 'priority') g.priority = a.pYes;
    else if (a.skill) g.skills = [...(g.skills ?? []), { skill: a.skill, pYes: a.pYes }];
    out.set(a.index, g);
  }
  return out;
}

/**
 * Which questions a run asks:
 * - `routed` (the runtime): skill questions for every candidate with
 *   proposals; the requirement question only for `uncertainSegments`; the
 *   priority question only where it applies after the others.
 * - `eager`: as routed, but the priority question for every routed
 *   headerless segment, so an offline sweep can replay any τ_keep.
 * - `all` (evals): every question for every candidate, so a sweep can also
 *   replay other routing rules.
 */
export type QuestionMode = 'routed' | 'eager' | 'all';

/**
 * Decisions for every candidate from recorded answers, applying the routing
 * rules: a requirement answer counts only for a routed segment (an `all`
 * run records more than the runtime would use). The offline sweep and the
 * runtime both come through here, so replaying a run reproduces it.
 */
export function decideAll(
  seg: SegmentedJd,
  answers: readonly Answer[],
  t: Thresholds = THRESHOLDS,
  opts: { routeEverything?: boolean } = {},
): DecisionTrace[] {
  const grouped = groupAnswers(answers);
  const routes = routeAll(seg);
  return seg.candidates.map((index) => {
    const segment = seg.segments[index];
    const got = grouped.get(index) ?? {};
    const routed = opts.routeEverything || (routes.get(index)?.length ?? 0) > 0;
    const proposals = proposeSkills(segment);
    return decide(
      segment,
      {
        requirement: routed ? got.requirement : undefined,
        priority: routed ? got.priority : undefined,
        skills: got.skills?.filter((s) => proposals.includes(s.skill)),
      },
      t,
    );
  });
}

/** Totals of overrides across traces, for run stats. */
export function countOverrides(traces: readonly DecisionTrace[]): { keep: number; drop: number; priority: number; skills: number } {
  return traces.reduce(
    (acc, { overrides: o }) => ({
      keep: acc.keep + Number(o.keep),
      drop: acc.drop + Number(o.drop),
      priority: acc.priority + Number(o.priority),
      skills: acc.skills + o.skills.length,
    }),
    { keep: 0, drop: 0, priority: 0, skills: 0 },
  );
}
