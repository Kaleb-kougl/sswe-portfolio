import {
  analyzeWithDecisions,
  analyzeWithoutModel,
  defaultDecision,
  segmentJd,
  type FitReport,
  type SegmentDecision,
  type SegmentedJd,
} from '@/lib/fit';

import { labelledDecisions, type Fixture } from '../holdout';

/**
 * Scores one path (a model's decisions, or the no-model `defaultDecision`s)
 * on one labelled JD, against its labels and against the report a perfect
 * model would produce. Labels are matched to candidate segments by
 * evals/holdout.ts (exact on the fixtures, tolerant on holdout JDs); a label
 * that matches no candidate is `labelsMissed`, a loss for every path, and
 * counts only in `recallInclMissed`. Pure; used by compare.eval.ts, the
 * sweep and the embedding eval. The metrics follow the plan's Phase 3
 * graders (v4).
 */

export interface Counts {
  correct: number;
  total: number;
}

export interface FixtureScore {
  fixture: string;
  candidates: number;
  /** Per candidate segment: decision.requirement === ideal.requirement. */
  keep: Counts;
  /** Labelled requirements the path kept (recall of requirements). */
  keptLabelled: Counts;
  /** Kept candidates that are labelled requirements (precision of keeps). */
  keptPrecision: Counts;
  /** Kept labelled requirements whose code priority was null: final priority = label's. */
  priorityWhereCodeNull: Counts;
  /** Model-added skills on kept segments that the label names (precision). */
  addSkillsPrecision: Counts;
  /** Label skills code missed that the path added (recall). */
  addSkillsRecall: Counts;
  /** Labelled requirements whose row matches the ideal report's row (priority + verdict + skills). */
  rowAgreement: Counts;
  /** Labelled requirements whose verdict matches the ideal report's (present rows only count). */
  verdictAgreement: Counts;
  /** Rows in the report that are not labelled requirements. */
  spuriousRows: number;
  /** Labels that match no candidate segment (lost to segmentation, for every path). */
  labelsMissed: number;
  /** Labels whose segment was kept, over ALL labels (missed ones count as not kept). The other counts are per labelled segment. */
  recallInclMissed: Counts;
  coverage: FitReport['coverage'];
  idealCoverage: FitReport['coverage'];
  /** Per-candidate diffs vs ideal, for reading the failures. */
  diffs: string[];
}

const add = (a: Counts, b: Counts): Counts => ({ correct: a.correct + b.correct, total: a.total + b.total });
export const ZERO: Counts = { correct: 0, total: 0 };
export const pct = (c: Counts) => (c.total === 0 ? null : c.correct / c.total);

export function defaultDecisions(seg: SegmentedJd): SegmentDecision[] {
  return seg.candidates.map((i) => defaultDecision(seg.segments[i]));
}

export function scoreFixture(
  fixture: Fixture,
  decisions: readonly SegmentDecision[],
  report: FitReport,
  now: Date,
): FixtureScore {
  const seg = segmentJd(fixture.jd.trim());
  const { ideal, mapping } = labelledDecisions(fixture, seg);
  const idealReport = analyzeWithDecisions(fixture.jd, ideal, now);

  const s: FixtureScore = {
    fixture: fixture.name,
    candidates: seg.candidates.length,
    keep: { ...ZERO },
    keptLabelled: { ...ZERO },
    keptPrecision: { ...ZERO },
    priorityWhereCodeNull: { ...ZERO },
    addSkillsPrecision: { ...ZERO },
    addSkillsRecall: { ...ZERO },
    rowAgreement: { ...ZERO },
    verdictAgreement: { ...ZERO },
    spuriousRows: 0,
    labelsMissed: mapping.missed.length,
    recallInclMissed: { correct: 0, total: fixture.labels.length },
    coverage: report.coverage,
    idealCoverage: idealReport.coverage,
    diffs: [],
  };

  seg.candidates.forEach((index, pos) => {
    const segment = seg.segments[index];
    const d = decisions[pos];
    const want = ideal[pos];
    const label = mapping.byCandidate[pos];
    s.keep.total++;
    if (d.requirement === want.requirement) s.keep.correct++;
    else s.diffs.push(`${want.requirement ? 'DROPPED' : 'KEPT'} [${segment.section}] ${segment.text.slice(0, 90)}`);
    if (label) {
      s.keptLabelled.total++;
      if (d.requirement) s.keptLabelled.correct++;
    }
    if (d.requirement) {
      s.keptPrecision.total++;
      if (label) s.keptPrecision.correct++;
    }
    if (label && d.requirement && segment.priority === null) {
      s.priorityWhereCodeNull.total++;
      if (d.priority === label.priority) s.priorityWhereCodeNull.correct++;
      else s.diffs.push(`PRIORITY ${d.priority} ≠ ${label.priority}: ${segment.text.slice(0, 80)}`);
    }
    const added = [...new Set(d.addSkills)].filter((id) => !segment.skills.includes(id));
    const goldAdd = label ? label.skills.filter((id) => !segment.skills.includes(id)) : [];
    if (d.requirement) {
      for (const id of added) {
        s.addSkillsPrecision.total++;
        if (goldAdd.includes(id)) s.addSkillsPrecision.correct++;
        else s.diffs.push(`WRONG SKILL +${id}: ${segment.text.slice(0, 80)}`);
      }
    }
    for (const id of goldAdd) {
      s.addSkillsRecall.total++;
      if (d.requirement && added.includes(id)) s.addSkillsRecall.correct++;
    }
  });

  // Recall over every label (several may share a segment; a missed one counts as not kept).
  s.recallInclMissed.correct = mapping.candidateOfLabel.filter((pos) => pos !== null && decisions[pos].requirement).length;

  const rowByText = new Map(report.requirements.map((r) => [r.text, r]));
  for (const want of idealReport.requirements) {
    const got = rowByText.get(want.text);
    s.rowAgreement.total++;
    s.verdictAgreement.total++;
    if (!got) continue;
    if (got.verdict === want.verdict) s.verdictAgreement.correct++;
    const sameSkills = JSON.stringify([...got.skills].sort()) === JSON.stringify([...want.skills].sort());
    if (got.verdict === want.verdict && got.priority === want.priority && sameSkills) s.rowAgreement.correct++;
  }
  const idealTexts = new Set(idealReport.requirements.map((r) => r.text));
  s.spuriousRows = report.requirements.filter((r) => !idealTexts.has(r.text)).length;
  return s;
}

/** The no-model path on one fixture: exactly what /fit shows without Private mode. */
export function scoreNoModel(fixture: Fixture, now: Date): FixtureScore {
  const seg = segmentJd(fixture.jd.trim());
  return scoreFixture(fixture, defaultDecisions(seg), analyzeWithoutModel(fixture.jd, now), now);
}

export type Totals = Omit<FixtureScore, 'fixture' | 'coverage' | 'idealCoverage' | 'diffs' | 'candidates'> & {
  candidates: number;
  /** Fixtures whose coverage equals the ideal report's. */
  coverageExact: Counts;
};

export function totals(scores: readonly FixtureScore[]): Totals {
  const t: Totals = {
    candidates: 0,
    keep: { ...ZERO },
    keptLabelled: { ...ZERO },
    keptPrecision: { ...ZERO },
    priorityWhereCodeNull: { ...ZERO },
    addSkillsPrecision: { ...ZERO },
    addSkillsRecall: { ...ZERO },
    rowAgreement: { ...ZERO },
    verdictAgreement: { ...ZERO },
    spuriousRows: 0,
    labelsMissed: 0,
    recallInclMissed: { ...ZERO },
    coverageExact: { ...ZERO },
  };
  for (const s of scores) {
    t.candidates += s.candidates;
    t.keep = add(t.keep, s.keep);
    t.keptLabelled = add(t.keptLabelled, s.keptLabelled);
    t.keptPrecision = add(t.keptPrecision, s.keptPrecision);
    t.priorityWhereCodeNull = add(t.priorityWhereCodeNull, s.priorityWhereCodeNull);
    t.addSkillsPrecision = add(t.addSkillsPrecision, s.addSkillsPrecision);
    t.addSkillsRecall = add(t.addSkillsRecall, s.addSkillsRecall);
    t.rowAgreement = add(t.rowAgreement, s.rowAgreement);
    t.verdictAgreement = add(t.verdictAgreement, s.verdictAgreement);
    t.spuriousRows += s.spuriousRows;
    t.labelsMissed += s.labelsMissed ?? 0;
    t.recallInclMissed = add(t.recallInclMissed, s.recallInclMissed ?? { correct: s.keptLabelled.correct, total: s.keptLabelled.total });
    // Scan mode hides coverage when no must-have was found; compare like for like.
    const same = JSON.stringify(s.coverage) === JSON.stringify(s.idealCoverage);
    t.coverageExact = add(t.coverageExact, { correct: same ? 1 : 0, total: 1 });
  }
  return t;
}
