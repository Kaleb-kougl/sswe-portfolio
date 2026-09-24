import { CORPUS, type Corpus } from '@/data/corpus';

import type { FitReport, Requirement, SegmentDecision } from './contract';
import { coverageOf, judge } from './judge';
import { defaultDecision, mergeDecisions } from './merge';
import { validateJd } from './prompt';
import { segmentJd } from './segment';

/**
 * The whole pipeline in one call, with and without a model's decisions.
 * The worker streams the same steps row by row (segmentJd → mergeOne →
 * judgeRequirement); these are the batch forms for the no-model path, the
 * eval runner and tests.
 */

/** Rejects input `validateJd` rejects; the UI validates first and shows its message. */
function segmented(jd: string) {
  const check = validateJd(jd);
  if (!check.ok) throw new RangeError(check.message);
  return segmentJd(check.jd);
}

/**
 * The report's coverage, or null when it would mislead:
 * - no must-haves were identified (a headerless JD without a "required"), or
 * - fewer than half of the must-haves could be assessed. On a JD mostly
 *   outside the vocabulary (a marketing role: HubSpot, storytelling), a
 *   score over the one or two assessable rows would read as a match.
 * Otherwise `coverageOf`: (strong + ½ partial) over the assessable must-haves.
 * The worker uses this too, so both modes show coverage by the same rule.
 */
export function reportCoverage(rows: readonly Requirement[]): FitReport['coverage'] {
  const musts = rows.filter((r) => r.priority === 'must');
  const assessable = musts.filter((r) => r.verdict !== 'not_assessed');
  if (musts.length === 0 || assessable.length * 2 < musts.length) return null;
  return coverageOf(rows);
}

/**
 * The no-model ("scan") report: steps 1–6, `defaultDecision` per candidate,
 * the merge, then judging, with coverage by `reportCoverage`.
 */
export function analyzeWithoutModel(jd: string, now: Date = new Date(), corpus: Corpus = CORPUS): FitReport {
  const seg = segmented(jd);
  const decisions = seg.candidates.map((i) => defaultDecision(seg.segments[i]));
  const report = judge(mergeDecisions(seg, decisions), corpus, now);
  return { ...report, mode: 'scan', coverage: reportCoverage(report.requirements) };
}

/** The model-mode report from a full set of decisions (one per candidate). */
export function analyzeWithDecisions(
  jd: string,
  decisions: readonly SegmentDecision[],
  now: Date = new Date(),
  corpus: Corpus = CORPUS,
): FitReport {
  const report = judge(mergeDecisions(segmented(jd), decisions), corpus, now);
  return { ...report, coverage: reportCoverage(report.requirements) };
}
