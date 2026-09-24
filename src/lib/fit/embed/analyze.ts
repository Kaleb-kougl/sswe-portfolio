import { CORPUS, type Corpus } from '@/data/corpus';

import { analyzeWithDecisions } from '../analyze';
import type { CanonicalSkillId, FitReport, SegmentDecision, SegmentedJd } from '../contract';
import { defaultDecision } from '../merge';
import { validateJd } from '../prompt';
import { segmentJd } from '../segment';

import { additionsFor, EMBED_PARAMS, scoreCandidates, type EmbedAddition, type EmbedParams, type SpanEmbedFn, type Vocabulary } from './index';

/**
 * The no-model ("scan") report with the embedding matcher's additions.
 *
 * The matcher acts as a wider alias scan: each candidate's added skills are
 * treated as if the scan had found them, so `defaultDecision` sees them
 * (a Responsibilities line that only said "Mentor engineers" now names a
 * skill and is kept as a nice-to-have) and `mergeOne` appends them after
 * code's own skills, which it can never displace. Everything else — rows,
 * priorities, judging, coverage — is the scan path unchanged, and the report
 * stays `mode: 'scan'`: no generative model was involved.
 */
export interface EmbedAnalysis {
  report: FitReport;
  seg: SegmentedJd;
  /** Segment index → what the matcher added, with the phrase that justified it. */
  additions: Map<number, EmbedAddition[]>;
}

/** The decisions `analyzeWithDecisions` takes, from a segmented JD and the matcher's additions. */
export function embedDecisions(seg: SegmentedJd, additions: ReadonlyMap<number, readonly EmbedAddition[]>): SegmentDecision[] {
  return seg.candidates.map((index) => {
    const segment = seg.segments[index];
    const added = (additions.get(index) ?? []).map((a) => a.skill as CanonicalSkillId);
    const decision = defaultDecision({ ...segment, skills: [...segment.skills, ...added] });
    return { ...decision, addSkills: added };
  });
}

/**
 * NOT WIRED INTO /fit: on the held-out JDs no threshold reached 95% precision
 * (evals/embed/results/). Kept for the eval and for a future, better model.
 */
export async function analyzeWithEmbeddings(
  jd: string,
  spanEmbed: SpanEmbedFn,
  vocab: Vocabulary,
  { params = EMBED_PARAMS, now = new Date(), corpus = CORPUS }: { params?: EmbedParams; now?: Date; corpus?: Corpus } = {},
): Promise<EmbedAnalysis> {
  const check = validateJd(jd);
  if (!check.ok) throw new RangeError(check.message);
  const seg = segmentJd(check.jd);
  const additions = additionsFor(seg, await scoreCandidates(seg, spanEmbed, vocab), params);
  const report = analyzeWithDecisions(jd, embedDecisions(seg, additions), now, corpus);
  return { report: { ...report, mode: 'scan' }, seg, additions };
}
