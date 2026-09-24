import { describe, it, expect } from 'vitest';

import { NEVER, proposeSkills, segmentJd, THRESHOLDS, uncertainSegments } from '@/lib/fit';
import type { AnswerRecord } from '@/lib/fit/local/protocol';

import { labelMatch, labelledDecisions, mapLabels, matchLabels, normalizeLine } from '../../evals/holdout';
import { scoreNoModel, totals } from '../../evals/local/score';
import { assertDisjoint, best, grid, noModelTotals, Replayer, tuneAndReport, type Split } from '../../evals/local/sweep';

import { FIXTURE_NOW, FIXTURES, idealDecisions } from './fixtures';

/**
 * The eval plumbing v2's decision rests on: label → segment matching for
 * independently labelled JDs, and the offline threshold sweep with its
 * tune-on-one-split, report-on-another guard. Synthetic text only: the
 * held-out JDs are never read by tests.
 */

describe('label matching (evals/holdout.ts)', () => {
  it('normalises bullets, emphasis, case, quotes, whitespace and trailing punctuation', () => {
    expect(normalizeLine('  • **Strong** TypeScript’s   types.  ')).toBe("strong typescript's types");
    expect(normalizeLine('1. React;')).toBe('react');
  });

  it('equal, label inside a segment (any length), segment inside a label (≥ 80% of it)', () => {
    expect(labelMatch('- React and TypeScript.', 'React and TypeScript')).toBe('equal');
    expect(labelMatch('You know React.', 'You know React. You also like Go and long walks on the beach.')).toBe('label-in-segment');
    expect(labelMatch('Experience with React and TypeScript at scale', 'Experience with React and TypeScript at')).toBe('segment-in-label');
    expect(labelMatch('Experience with React and TypeScript at scale', 'Experience with React')).toBeNull();
    expect(labelMatch('', 'React')).toBeNull();
  });

  it('several labels on one segment make one requirement: must if any is, skills unioned', () => {
    const seg = segmentJd('Requirements:\n- You know React well and you mentor others kindly and patiently.');
    const { bySegment, unmatched, byLabel } = matchLabels(seg, [
      { text: 'You know React well', priority: 'nice', skills: ['react'] },
      { text: 'you mentor others kindly and patiently.', priority: 'must', skills: ['mentoring'] },
      { text: 'Kubernetes', priority: 'must', skills: [] },
    ]);
    expect(bySegment.size).toBe(1);
    const [label] = [...bySegment.values()];
    expect(label.priority).toBe('must');
    expect(label.skills).toEqual(['react', 'mentoring']);
    expect(unmatched.map((l) => l.text)).toEqual(['Kubernetes']);
    expect(byLabel).toEqual([seg.candidates[0], seg.candidates[0], null]);
  });

  it('a label on a non-candidate segment (about, benefits) is missed by segmentation', () => {
    const seg = segmentJd('About us\nWe love React.\nRequirements:\n- Go');
    const m = mapLabels({ labels: [{ text: 'We love React.', priority: 'must', skills: [] }] }, seg);
    expect(m.missed).toHaveLength(1);
    expect(m.candidateOfLabel).toEqual([null]);
  });

  it('on the fixtures it is exactly idealDecisions, and the no-model scores are unchanged', () => {
    for (const f of FIXTURES) {
      const seg = segmentJd(f.jd);
      const { ideal, mapping } = labelledDecisions(f, seg);
      expect(ideal).toEqual(idealDecisions(f, seg));
      expect(mapping.missed).toEqual([]);
    }
    const t = totals(FIXTURES.map((f) => scoreNoModel(f, FIXTURE_NOW)));
    // evals/local/results/2026-09-23-summary.md had [76, 81, 55, 70]; the 2g code loop raised it.
    expect([t.keep.correct, t.keep.total, t.rowAgreement.correct, t.rowAgreement.total]).toEqual([78, 81, 57, 70]);
    expect(t.recallInclMissed).toEqual(t.keptLabelled);
    expect(t.labelsMissed).toBe(0);
  });
});

/** Answers a perfect model would give on a fixture: P(yes) = 1 or 0 from the labels. */
function perfectAnswers(name: string): AnswerRecord[] {
  const f = FIXTURES.find((x) => x.name === name)!;
  const seg = segmentJd(f.jd);
  const ideal = idealDecisions(f, seg);
  const routed = new Set(uncertainSegments(seg));
  return seg.candidates.flatMap((index, pos): AnswerRecord[] => [
    ...proposeSkills(seg.segments[index]).map((skill) => ({
      index,
      kind: 'skill' as const,
      skill,
      pYes: ideal[pos].addSkills.includes(skill) ? 1 : 0,
      ms: 1,
      promptTokens: 1,
    })),
    ...(routed.has(index) ? [{ index, kind: 'requirement' as const, pYes: ideal[pos].requirement ? 1 : 0, ms: 1, promptTokens: 1 }] : []),
    { index, kind: 'priority' as const, pYes: ideal[pos].priority === 'must' ? 1 : 0, ms: 1, promptTokens: 1 },
  ]);
}

const split = (name: string, names: string[]): Split => ({ name, cases: FIXTURES.filter((f) => names.includes(f.name)) });

describe('sweep (evals/local/sweep.ts)', () => {
  const answers = new Map(FIXTURES.map((f) => [f.name, perfectAnswers(f.name)]));
  const replayer = new Replayer(answers, FIXTURE_NOW);

  it('τ = 1 replays to the no-model path', () => {
    const t = replayer.totals(FIXTURES, NEVER);
    expect(t).toEqual(noModelTotals(FIXTURES, FIXTURE_NOW));
  });

  it('a perfect model at the starting thresholds fixes every error the routing reaches', () => {
    const t = replayer.totals(FIXTURES, THRESHOLDS);
    expect(t.keep).toEqual({ correct: 81, total: 81 });
    expect(t.addSkillsRecall).toEqual({ correct: 8, total: 8 });
    expect(t.addSkillsPrecision.correct).toBe(t.addSkillsPrecision.total);
  });

  it('the guard: splits must be disjoint and non-empty, by name and by text', () => {
    const a = split('a', ['frontend-senior', 'ai-platform']);
    const b = split('b', ['poor-match-backend']);
    expect(() => assertDisjoint(a, b)).not.toThrow();
    expect(() => assertDisjoint(a, a)).toThrow(/share/);
    expect(() => assertDisjoint(a, { name: 'empty', cases: [] })).toThrow(/empty/);
    expect(() => assertDisjoint({ name: 'none', cases: [] }, b)).toThrow(/empty/);
    const renamed = { name: 'copy', cases: [{ ...a.cases[0], name: 'renamed' }] };
    expect(() => assertDisjoint(a, renamed)).toThrow(/by text/);
    expect(() => tuneAndReport(replayer, a, a, THRESHOLDS, [0.9, 1])).toThrow();
  });

  it('tuneAndReport chooses on the tune split only', () => {
    const tune = split('tune', ['frontend-senior', 'prose-only-startup', 'boilerplate-payments']);
    const report = split('report', ['fullstack-senior', 'responsibilities-tech']);
    const r = tuneAndReport(replayer, tune, report, THRESHOLDS, [0.5, 0.9, 1]);
    expect(r.chosen).toEqual(best(grid(replayer, tune.cases, [0.5, 0.9, 1])).t);
    expect(r.onReport.noModel).toEqual(noModelTotals(report.cases, FIXTURE_NOW));
    // Ties go to the more conservative thresholds.
    expect(r.chosen.priority + r.chosen.keep + r.chosen.drop + r.chosen.skill).toBeGreaterThan(2);
  });
});
