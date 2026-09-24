import { analyzeWithDecisions, decideAll, segmentJd, type SegmentDecision, type Thresholds } from '@/lib/fit';
import type { AnswerRecord } from '@/lib/fit/local/protocol';

import type { Fixture } from '../holdout';

import { scoreFixture, scoreNoModel, totals, type Counts, type FixtureScore, type Totals } from './score';

/**
 * OFFLINE THRESHOLD SWEEP for model + code v2 (plan 2f). A v2 eval run
 * records P(yes) for every question (compare.eval.ts, `questions: 'all'`),
 * so any thresholds can be replayed through `decideAll` without running a
 * model again.
 *
 * The rule this module enforces: thresholds are CHOSEN on one split and
 * REPORTED on another. `tuneAndReport` throws if the splits share a JD or
 * the report split is empty, and `explore` (the whole grid on one split) is
 * labelled in-sample and never returns a choice.
 */

/** Threshold values tried per dimension (τ_keep, τ_drop, τ_priority, τ_skill). 1 = never override. */
export const GRID: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1];

export interface Split {
  /** How the split was declared, e.g. "fixtures" or "holdout". */
  name: string;
  cases: readonly Fixture[];
}

/** Answers per case name (from one model's runs). */
export type AnswersByCase = ReadonlyMap<string, readonly AnswerRecord[]>;

const NOW = new Date('2026-09-23T12:00:00Z');

/** Scores are memoised per case and decision set: most threshold combinations give identical decisions. */
export class Replayer {
  private cache = new Map<string, FixtureScore>();
  private segs = new Map<string, ReturnType<typeof segmentJd>>();

  constructor(
    private readonly answers: AnswersByCase,
    private readonly now: Date = NOW,
  ) {}

  private seg(c: Fixture) {
    let s = this.segs.get(c.name);
    if (!s) this.segs.set(c.name, (s = segmentJd(c.jd.trim())));
    return s;
  }

  decisions(c: Fixture, t: Thresholds, routeEverything = false): SegmentDecision[] {
    const answers = this.answers.get(c.name);
    if (!answers) throw new Error(`No recorded answers for ${c.name}`);
    return decideAll(this.seg(c), answers, t, { routeEverything }).map((x) => x.decision);
  }

  score(c: Fixture, t: Thresholds, routeEverything = false): FixtureScore {
    const d = this.decisions(c, t, routeEverything);
    const key = `${c.name}\n${JSON.stringify(d)}`;
    let s = this.cache.get(key);
    if (!s) this.cache.set(key, (s = scoreFixture(c, d, analyzeWithDecisions(c.jd, d, this.now), this.now)));
    return s;
  }

  totals(cases: readonly Fixture[], t: Thresholds, routeEverything = false): Totals {
    return totals(cases.map((c) => this.score(c, t, routeEverything)));
  }
}

/** The no-model path's totals on a split (the bar). */
export function noModelTotals(cases: readonly Fixture[], now: Date = NOW): Totals {
  return totals(cases.map((c) => scoreNoModel(c, now)));
}

export interface GridPoint {
  t: Thresholds;
  totals: Totals;
}

/** Every combination of GRID values, scored on `cases`. */
export function grid(replayer: Replayer, cases: readonly Fixture[], values: readonly number[] = GRID, routeEverything = false): GridPoint[] {
  const out: GridPoint[] = [];
  for (const keep of values)
    for (const drop of values)
      for (const priority of values)
        for (const skill of values) {
          const t = { keep, drop, priority, skill };
          out.push({ t, totals: replayer.totals(cases, t, routeEverything) });
        }
  return out;
}

const ratio = (c: Counts) => (c.total ? c.correct / c.total : 0);

/**
 * The objective, in order: row agreement with the ideal report; keep/drop
 * accuracy; addSkills precision (a wrong skill is worse than a missed one);
 * then the more conservative thresholds (higher sum), so a tie never buys
 * an override the data didn't ask for.
 */
export function better(a: GridPoint, b: GridPoint): number {
  return (
    b.totals.rowAgreement.correct - a.totals.rowAgreement.correct ||
    b.totals.keep.correct - a.totals.keep.correct ||
    ratio(b.totals.addSkillsPrecision) - ratio(a.totals.addSkillsPrecision) ||
    sum(b.t) - sum(a.t)
  );
}

const sum = (t: Thresholds) => t.keep + t.drop + t.priority + t.skill;

export function best(points: readonly GridPoint[]): GridPoint {
  if (!points.length) throw new Error('Empty grid');
  return [...points].sort(better)[0];
}

/** Throws unless the two splits are disjoint and both non-empty. */
export function assertDisjoint(tune: Split, report: Split): void {
  if (!tune.cases.length) throw new Error(`Tuning split "${tune.name}" is empty.`);
  if (!report.cases.length) {
    throw new Error(`Report split "${report.name}" is empty: thresholds tuned on "${tune.name}" can't be reported on the data they were tuned on.`);
  }
  const names = new Set(tune.cases.map((c) => c.name));
  const shared = report.cases.filter((c) => names.has(c.name)).map((c) => c.name);
  if (shared.length) throw new Error(`Splits "${tune.name}" and "${report.name}" share ${shared.join(', ')}: tune on one, report on another.`);
  const texts = new Set(tune.cases.map((c) => c.jd.trim()));
  const sameText = report.cases.filter((c) => texts.has(c.jd.trim())).map((c) => c.name);
  if (sameText.length) throw new Error(`Report split "${report.name}" repeats tuning JDs (by text): ${sameText.join(', ')}.`);
}

export interface TunedReport {
  tune: string;
  report: string;
  chosen: Thresholds;
  onTune: { chosen: Totals; noModel: Totals; start: Totals };
  onReport: { chosen: Totals; noModel: Totals; start: Totals };
}

/**
 * Chooses thresholds on `tune` (best grid point) and reports them, the
 * starting thresholds and the no-model path on `report`. The report split
 * never influences the choice.
 */
export function tuneAndReport(
  replayer: Replayer,
  tune: Split,
  report: Split,
  start: Thresholds,
  values: readonly number[] = GRID,
): TunedReport {
  assertDisjoint(tune, report);
  const chosen = best(grid(replayer, tune.cases, values)).t;
  return {
    tune: tune.name,
    report: report.name,
    chosen,
    onTune: { chosen: replayer.totals(tune.cases, chosen), noModel: noModelTotals(tune.cases), start: replayer.totals(tune.cases, start) },
    onReport: { chosen: replayer.totals(report.cases, chosen), noModel: noModelTotals(report.cases), start: replayer.totals(report.cases, start) },
  };
}

/**
 * In-sample view of one split: accuracy as each threshold moves alone
 * (the others at `start`), plus the grid's best point, LABELLED as not a
 * choice. For reading the shape of the curve, not for picking thresholds.
 */
export function explore(replayer: Replayer, split: Split, start: Thresholds, values: readonly number[] = GRID) {
  const dims = ['keep', 'drop', 'priority', 'skill'] as const;
  const curves = Object.fromEntries(
    dims.map((dim) => [dim, values.map((v) => ({ value: v, totals: replayer.totals(split.cases, { ...start, [dim]: v }) }))]),
  ) as Record<(typeof dims)[number], { value: number; totals: Totals }[]>;
  const inSampleBest = best(grid(replayer, split.cases, values));
  return {
    split: split.name,
    warning: 'IN-SAMPLE: thresholds read off this table are fitted to these JDs. Choose on one split and report on another (tuneAndReport).',
    noModel: noModelTotals(split.cases),
    start: replayer.totals(split.cases, start),
    routeEverythingAtStart: replayer.totals(split.cases, start, true),
    curves,
    inSampleBest,
  };
}
