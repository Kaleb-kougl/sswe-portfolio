import type { Fixture } from '../holdout';

import { analyzeWithDecisions, detectSkills, segmentJd, type SegmentedJd } from '@/lib/fit';
import { embedDecisions } from '@/lib/fit/embed/analyze';
import {
  additionsFor,
  extractPhrases,
  matchSegment,
  scorePhrase,
  skillSimilarities,
  type EmbedFn,
  type EmbedParams,
  type PhraseScore,
  type ScoredSegment,
  type Vocabulary,
  scoreCandidates,
  scoreCandidatesIsolated,
  scoreInContext,
  type SpanEmbedFn,
} from '@/lib/fit/embed';

import { mapLabels } from '../holdout';
import { scoreFixture, scoreNoModel } from '../local/score';

import { NEGATIVES, SYNONYMS } from './cases';

/**
 * Scoring for the embedding matcher. Phrases are embedded once per set
 * (`prepare*`); a threshold sweep then only re-applies `matchSegment`.
 */

export interface Tally {
  tp: number;
  fp: number;
  /** Gold additions (skills a label names that the alias scan missed). */
  gold: number;
  /** Wrong adds, for reading. */
  wrong: string[];
  /** Correct adds, for reading. */
  right: string[];
  /** Negative lines that got any add. */
  negativeHits: number;
  negatives: number;
}

export const precision = (t: Tally) => (t.tp + t.fp === 0 ? 1 : t.tp / (t.tp + t.fp));
export const recall = (t: Tally) => (t.gold === 0 ? 0 : t.tp / t.gold);

const empty = (): Tally => ({ tp: 0, fp: 0, gold: 0, wrong: [], right: [], negativeHits: 0, negatives: 0 });

const canonicalFound = (text: string) => detectSkills(text).filter((s) => !s.gap).map((s) => s.id);

async function scoreTexts(
  texts: readonly string[],
  embed: EmbedFn,
  vocab: Vocabulary,
  spanEmbed?: SpanEmbedFn,
): Promise<{ scores: PhraseScore[]; context: Record<string, number> }[]> {
  if (spanEmbed) {
    const out = [];
    for (const t of texts) {
      const r = await scoreInContext(t, spanEmbed, vocab);
      out.push({ scores: r.phrases, context: r.context });
    }
    return out;
  }
  const per = texts.map(extractPhrases);
  const unique = [...new Set(per.flat())];
  const vectors = unique.length ? await embed(unique) : [];
  const ctx = await embed([...texts]);
  const byPhrase = new Map(unique.map((p, i) => [p, scorePhrase(p, vectors[i], vocab)]));
  return per.map((ps, i) => ({ scores: ps.map((p) => byPhrase.get(p)!), context: skillSimilarities(ctx[i], vocab) }));
}

// ------------------------------------------------------------ hand-written (tuning split)

export interface PreparedCases {
  synonyms: { text: string; gold: string[]; allow: string[]; found: string[]; scores: PhraseScore[]; context: Record<string, number> }[];
  /** Synonym cases whose skill the scan already finds (not counted). */
  skipped: string[];
  negatives: { text: string; found: string[]; scores: PhraseScore[]; context: Record<string, number> }[];
}

export async function prepareCases(embed: EmbedFn, vocab: Vocabulary, spanEmbed?: SpanEmbedFn): Promise<PreparedCases> {
  const synScores = await scoreTexts(SYNONYMS.map((c) => c.text), embed, vocab, spanEmbed);
  const negScores = await scoreTexts(NEGATIVES, embed, vocab, spanEmbed);
  const skipped: string[] = [];
  const synonyms = SYNONYMS.flatMap((c, i) => {
    const found = canonicalFound(c.text);
    const gold = c.expect.filter((s) => !found.includes(s));
    if (!gold.length) {
      skipped.push(`${c.text} (scan finds ${c.expect.join(', ')})`);
      return [];
    }
    return [{ text: c.text, gold, allow: c.allow ?? [], found, ...synScores[i] }];
  });
  const negatives = NEGATIVES.map((text, i) => ({ text, found: canonicalFound(text), ...negScores[i] }));
  return { synonyms, skipped, negatives };
}

export function tallyCases(p: PreparedCases, params: EmbedParams): Tally {
  const t = empty();
  for (const c of p.synonyms) {
    const adds = matchSegment(c.scores, c.found, params, c.context);
    t.gold += c.gold.length;
    for (const a of adds) {
      if (c.gold.includes(a.skill)) {
        t.tp++;
        t.right.push(`+${a.skill} ← "${a.phrase}" (${a.score.toFixed(3)}) in "${c.text}"`);
      } else if (!c.allow.includes(a.skill)) {
        t.fp++;
        t.wrong.push(`+${a.skill} ← "${a.phrase}" (${a.score.toFixed(3)}) in "${c.text}"`);
      }
    }
  }
  for (const n of p.negatives) {
    const adds = matchSegment(n.scores, n.found, params, n.context);
    t.negatives++;
    if (adds.length) t.negativeHits++;
    for (const a of adds) {
      t.fp++;
      t.wrong.push(`NEG +${a.skill} ← "${a.phrase}" (${a.score.toFixed(3)}) in "${n.text}"`);
    }
  }
  return t;
}

// ------------------------------------------------------------ labelled JDs (report splits)

export interface PreparedJd {
  fixture: Fixture;
  seg: SegmentedJd;
  scored: ScoredSegment[];
  /** Segment index → skills the label names that the scan missed. */
  gold: Map<number, string[]>;
  labelled: Set<number>;
  /** Labels that match no candidate segment (segmentation misses: the matcher never sees them). */
  unmatched: number;
}

export async function prepareJds(
  fixtures: readonly Fixture[],
  embed: EmbedFn,
  vocab: Vocabulary,
  spanEmbed?: SpanEmbedFn,
): Promise<PreparedJd[]> {
  const out: PreparedJd[] = [];
  for (const fixture of fixtures) {
    const seg = segmentJd(fixture.jd.trim());
    const { byCandidate, missed } = mapLabels(fixture, seg);
    const gold = new Map<number, string[]>();
    const labelled = new Set<number>();
    byCandidate.forEach((label, pos) => {
      if (!label) return;
      const index = seg.candidates[pos];
      labelled.add(index);
      const miss = label.skills.filter((s) => !seg.segments[index].skills.includes(s));
      if (miss.length) gold.set(index, miss);
    });
    out.push({
      fixture,
      seg,
      scored: spanEmbed ? await scoreCandidates(seg, spanEmbed, vocab) : await scoreCandidatesIsolated(seg, embed, vocab),
      gold,
      labelled,
      unmatched: missed.length,
    });
  }
  return out;
}

export interface JdTally extends Tally {
  /** Wrong adds on candidate segments that aren't labelled requirements. */
  fpUnlabelled: number;
  /** Misses (gold adds not made), for reading. */
  missed: string[];
}

export function tallyJds(jds: readonly PreparedJd[], params: EmbedParams): JdTally {
  const t: JdTally = { ...empty(), fpUnlabelled: 0, missed: [] };
  for (const jd of jds) {
    const adds = additionsFor(jd.seg, jd.scored, params);
    for (const [index, gold] of jd.gold) {
      t.gold += gold.length;
      const got = (adds.get(index) ?? []).map((a) => a.skill);
      for (const s of gold) if (!got.includes(s)) t.missed.push(`${jd.fixture.name}: -${s} in "${jd.seg.segments[index].text.slice(0, 80)}"`);
    }
    for (const [index, list] of adds) {
      const gold = jd.gold.get(index) ?? [];
      for (const a of list) {
        const where = `${jd.fixture.name}: +${a.skill} ← "${a.phrase}" (${a.score.toFixed(3)}, via "${a.via}") in "${jd.seg.segments[index].text.slice(0, 80)}"`;
        if (gold.includes(a.skill)) {
          t.tp++;
          t.right.push(where);
        } else {
          t.fp++;
          if (!jd.labelled.has(index)) t.fpUnlabelled++;
          t.wrong.push(where);
        }
      }
    }
  }
  return t;
}

/** Row agreement with the ideal report, scan alone vs scan + matcher (score.ts's definition). */
export function rowAgreement(jds: readonly PreparedJd[], params: EmbedParams, now: Date) {
  let scan = 0;
  let embedded = 0;
  let total = 0;
  let spuriousScan = 0;
  let spuriousEmbed = 0;
  const perFixture: { name: string; scan: string; embed: string }[] = [];
  for (const jd of jds) {
    const additions = additionsFor(jd.seg, jd.scored, params);
    const decisions = embedDecisions(jd.seg, additions);
    const report = { ...analyzeWithDecisions(jd.fixture.jd, decisions, now), mode: 'scan' as const };
    const withEmbed = scoreFixture(jd.fixture, decisions, report, now);
    const base = scoreNoModel(jd.fixture, now);
    scan += base.rowAgreement.correct;
    embedded += withEmbed.rowAgreement.correct;
    total += base.rowAgreement.total;
    spuriousScan += base.spuriousRows;
    spuriousEmbed += withEmbed.spuriousRows;
    perFixture.push({
      name: jd.fixture.name,
      scan: `${base.rowAgreement.correct}/${base.rowAgreement.total}`,
      embed: `${withEmbed.rowAgreement.correct}/${withEmbed.rowAgreement.total}`,
    });
  }
  return { scan, embedded, total, spuriousScan, spuriousEmbed, perFixture };
}
