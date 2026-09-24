import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { SegmentDecision, SegmentedJd } from '@/lib/fit/contract';

import { FIXTURES, type Fixture, type Label } from '../__tests__/fit/fixtures';

/**
 * LABELLED JD SETS for every fit-checker eval (local models, embeddings),
 * and the one place labels are matched to segments.
 *
 * - `fixtures`: the 8 JDs in __tests__/fit/fixtures. The rules and these
 *   labels were written together: development data, never the bar.
 * - `holdout`: `<name>.txt` + `<name>.labels.json` in a directory (default
 *   evals/cases/holdout, or FIT_HOLDOUT_DIR). Third-party postings,
 *   gitignored, labelled independently. Results that quote them belong
 *   under a gitignored path (evals/local/results/holdout/). Don't tune rules
 *   or thresholds by reading them.
 *
 * `<name>.labels.json` is `{ role?, labels: Label[] }` or a bare `Label[]`.
 * Holdout label texts are verbatim JD lines (bullet marker stripped), not
 * `segmentJd`'s segment text, and sometimes one sentence of a longer
 * bullet, so labels are matched to segments by `labelMatch` (see
 * `matchLabels`). A label that matches no candidate segment is a
 * requirement MISSED by segmentation: a recall loss for every strategy,
 * since models only see candidates.
 */

export type { Fixture, Label };

export const HOLDOUT_DIR = path.resolve(
  process.env.FIT_HOLDOUT_DIR ?? process.env.EMBED_HOLDOUT_DIR ?? path.join(__dirname, 'cases/holdout'),
);

export function fixtureSet(): Fixture[] {
  return [...FIXTURES];
}

/** Every `<name>.txt` in `dir`; those with a labels file are scored, the rest only counted. */
export function loadHoldout(dir: string = HOLDOUT_DIR): { labelled: Fixture[]; unlabelled: string[] } {
  if (!existsSync(dir)) return { labelled: [], unlabelled: [] };
  const labelled: Fixture[] = [];
  const unlabelled: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const name = file.slice(0, -4);
    const jd = readFileSync(path.join(dir, file), 'utf8');
    const labelsFile = path.join(dir, `${name}.labels.json`);
    if (!existsSync(labelsFile)) {
      unlabelled.push(name);
      continue;
    }
    const raw = JSON.parse(readFileSync(labelsFile, 'utf8')) as Label[] | { role?: string; labels: Label[] };
    const labels = Array.isArray(raw) ? raw : raw.labels;
    labelled.push({ name, jd, role: Array.isArray(raw) ? '' : (raw.role ?? ''), labels });
  }
  return { labelled, unlabelled };
}

/** Bullet markers a pasted line may keep: ASCII, typographic, numbered, lettered. */
const BULLET = /^\s*(?:[-*+•·–—▪▫◦●○■□►▸➤➢→✓✔☑❖◆◇]|\(?\d{1,2}[.)]|\(?[a-z]\))\s+/iu;

/** For matching only: bullet marker, Markdown emphasis, case, curly quotes, whitespace and trailing punctuation go. */
export function normalizeLine(text: string): string {
  return text
    .replace(BULLET, '')
    .replace(/\*\*|__/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,;:!?]+$/u, '')
    .toLowerCase();
}

/** A segment inside a label must be at least this share of the label's length. */
export const CONTAINMENT_RATIO = 0.8;

/**
 * How a label's text relates to a segment's, after `normalizeLine`:
 * - `equal`;
 * - `label-in-segment`: the label is one sentence of a longer bullet or
 *   paragraph (holdout labels sometimes are), whatever the lengths;
 * - `segment-in-label`: the segment is most of the label (≥ 80% of its
 *   length), e.g. segmentation cut a trailing clause;
 * - null: no match.
 */
export function labelMatch(label: string, segment: string): 'equal' | 'label-in-segment' | 'segment-in-label' | null {
  const l = normalizeLine(label);
  const s = normalizeLine(segment);
  if (!l || !s) return null;
  if (l === s) return 'equal';
  if (s.includes(l)) return 'label-in-segment';
  if (l.includes(s) && s.length >= CONTAINMENT_RATIO * l.length) return 'segment-in-label';
  return null;
}

export function labelMatchesSegment(label: string, segment: string): boolean {
  return labelMatch(label, segment) !== null;
}

/** Same as `loadHoldout`, for any directory of cases in that format. */
export const loadCaseDir = loadHoldout;

const RANK = { equal: 0, 'label-in-segment': 1, 'segment-in-label': 2 } as const;

/**
 * Labels → segments (ANY segment, candidate or not). Each label goes to its
 * best match (equal, then label-in-segment, then segment-in-label; among
 * equals a candidate first, then document order). Several labels may land
 * on one segment (sentences of one paragraph): it then counts as ONE
 * requirement, `must` if any of them is, with the union of their skills,
 * under the first label's text. `unmatched`: labels no segment matched.
 * Shared by the local-model and embedding evals.
 */
export function matchLabels(
  seg: SegmentedJd,
  labels: readonly Label[],
): { bySegment: Map<number, Label>; unmatched: Label[]; byLabel: (number | null)[] } {
  const candidates = new Set(seg.candidates);
  const bySegment = new Map<number, Label>();
  const unmatched: Label[] = [];
  /** Per label, in order: the segment index it matched, or null. */
  const byLabel: (number | null)[] = [];
  for (const label of labels) {
    let best: { index: number; rank: number; candidate: boolean } | null = null;
    for (const s of seg.segments) {
      const how = labelMatch(label.text, s.text);
      if (!how) continue;
      const rank = RANK[how];
      const candidate = candidates.has(s.index);
      if (!best || rank < best.rank || (rank === best.rank && candidate && !best.candidate)) best = { index: s.index, rank, candidate };
    }
    byLabel.push(best?.index ?? null);
    if (!best) {
      unmatched.push(label);
      continue;
    }
    const prev = bySegment.get(best.index);
    bySegment.set(
      best.index,
      prev
        ? {
            text: prev.text,
            priority: prev.priority === 'must' || label.priority === 'must' ? 'must' : 'nice',
            skills: [...new Set([...prev.skills, ...label.skills])],
          }
        : { ...label, skills: [...label.skills] },
    );
  }
  return { bySegment, unmatched, byLabel };
}

export interface LabelMapping {
  /** Per candidate position: the label it matched, or null (not a requirement). */
  byCandidate: (Label | null)[];
  /**
   * Labels that match no CANDIDATE: no segment at all, or one code never
   * offers (about/benefits, or past MAX_CANDIDATES). Requirements lost
   * before any model runs.
   */
  missed: Label[];
  /** Per label, in order: the candidate position it landed on, or null (missed). */
  candidateOfLabel: (number | null)[];
}

/**
 * `matchLabels`, seen from the candidates. On the fixtures (label text =
 * segment text) this is exactly `idealDecisions`' matching.
 */
export function mapLabels(fixture: Pick<Fixture, 'labels'>, seg: SegmentedJd): LabelMapping {
  const { bySegment, byLabel } = matchLabels(seg, fixture.labels);
  const candidates = new Set(seg.candidates);
  return {
    byCandidate: seg.candidates.map((index) => bySegment.get(index) ?? null),
    missed: fixture.labels.filter((_, i) => byLabel[i] === null || !candidates.has(byLabel[i]!)),
    candidateOfLabel: byLabel.map((index) => (index === null ? null : seg.candidates.indexOf(index) >= 0 ? seg.candidates.indexOf(index) : null)),
  };
}

/**
 * The decisions a perfect model would make (as `idealDecisions`), from the
 * tolerant mapping: a matched candidate is a requirement at the label's
 * priority, adding the label's skills code didn't find; the rest are not.
 * Never throws; unmatched labels come back as `missed`.
 */
export function labelledDecisions(fixture: Pick<Fixture, 'labels'>, seg: SegmentedJd): { ideal: SegmentDecision[]; mapping: LabelMapping } {
  const mapping = mapLabels(fixture, seg);
  const ideal = seg.candidates.map((index, pos): SegmentDecision => {
    const label = mapping.byCandidate[pos];
    if (!label) return { requirement: false, priority: 'nice', addSkills: [] };
    const segment = seg.segments[index];
    return { requirement: true, priority: label.priority, addSkills: label.skills.filter((s) => !segment.skills.includes(s)) };
  });
  return { ideal, mapping };
}
