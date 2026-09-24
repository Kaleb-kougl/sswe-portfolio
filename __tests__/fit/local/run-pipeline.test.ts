import { describe, it, expect } from 'vitest';

import {
  analyzeWithDecisions,
  buildDecisionMessages,
  CanonicalSkillId,
  defaultDecision,
  judge,
  judgeRequirement,
  MAX_REQUIREMENTS,
  mergeDecisions,
  mergeOne,
  prepareExtraction,
  reportCoverage,
  segmentJd,
  validateJd,
  type Requirement,
  type SegmentDecision,
} from '@/lib/fit';
import type { FromWorker } from '@/lib/fit/local/protocol';
import { capFate, runExtraction, type RunDeps, type RunEngine } from '@/lib/fit/local/run';

import { FIXTURES } from '../fixtures';

/**
 * STREAMING = BATCH, over real JDs. The worker posts rows as decisions
 * stream in; the batch form is `judge(mergeDecisions(segmentJd(jd), ds))`
 * (= analyzeWithDecisions). For every fixture JD, a long JD that hits the
 * MAX_REQUIREMENTS cap, and many decision sets, the streamed rows must equal
 * the final report's rows — except the documented must-upgrade of a
 * duplicate (run.ts), where only the priority may differ, nice → must.
 */

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}

const IDS = CanonicalSkillId.options;

function randomDecisions(n: number, seed: number, keepRate: number): SegmentDecision[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    requirement: r() < keepRate,
    priority: r() < 0.5 ? 'must' : 'nice',
    addSkills: r() < 0.3 ? [IDS[Math.floor(r() * IDS.length)]] : [],
  }));
}

function engineFor(decisions: SegmentDecision[], chunk: number): RunEngine {
  const doc = JSON.stringify({ decisions });
  return {
    async *stream() {
      for (let i = 0; i < doc.length; i += chunk) yield { delta: doc.slice(i, i + chunk) };
    },
    interrupt() {},
  };
}

async function stream(jd: string, decisions: SegmentDecision[], chunk = 5) {
  const posted: FromWorker[] = [];
  const deps: RunDeps = {
    engine: engineFor(decisions, chunk),
    post: (m) => posted.push(m),
    validateJd,
    segmentJd,
    buildMessages: buildDecisionMessages,
    defaultDecision,
    mergeOne,
    mergeDecisions,
    prepareExtraction,
    judgeRequirement: (req) => judgeRequirement(req),
    judge: (x) => judge(x),
    reportCoverage,
  };
  await runExtraction(1, jd, deps).done;
  const done = posted.at(-1);
  if (done?.type !== 'done') throw new Error(`run did not finish: ${JSON.stringify(done)}`);
  const rows = posted.flatMap((m) => (m.type === 'row' ? [m] : []));
  rows.forEach((m, i) => expect(m.index).toBe(i));
  return { rows: rows.map((m) => m.row), done };
}

function expectStreamEqualsFinal(rows: Requirement[], final: Requirement[]) {
  expect(rows).toHaveLength(final.length);
  rows.forEach((row, i) => {
    expect({ ...row, priority: final[i].priority }).toEqual(final[i]);
    if (row.priority !== final[i].priority) expect([row.priority, final[i].priority]).toEqual(['nice', 'must']);
  });
}

/** 30 requirement bullets + 12 nice-to-haves: over both caps (40 candidates, 25 rows). */
const LONG_JD = [
  'Staff Platform Engineer',
  'Requirements:',
  ...Array.from({ length: 30 }, (_, i) =>
    `- ${['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'PostgreSQL'][i % 6]} experience, area ${i + 1}`,
  ),
  'Nice to have:',
  ...Array.from({ length: 12 }, (_, i) => `- ${['Go', 'Kubernetes', 'Rust', 'Terraform'][i % 4]} exposure, topic ${i + 1}`),
].join('\n');

const JDS = [...FIXTURES.map((f) => [f.name, f.jd] as const), ['long-over-cap', LONG_JD] as const];

describe('streamed rows = judge(mergeDecisions(segmentJd(jd), decisions))', () => {
  it.each(JDS)('%s: default, all-keep, all-drop and 12 random decision sets', async (_name, jd) => {
    const seg = segmentJd(validateJd(jd).ok ? jd.trim() : jd);
    const n = seg.candidates.length;
    const sets: SegmentDecision[][] = [
      seg.candidates.map((i) => defaultDecision(seg.segments[i])),
      randomDecisions(n, 7, 1),
      randomDecisions(n, 8, 0),
      ...Array.from({ length: 12 }, (_, k) => randomDecisions(n, 100 + k, 0.3 + (k % 4) * 0.2)),
    ];
    for (const [k, decisions] of sets.entries()) {
      const { rows, done } = await stream(jd, decisions, 1 + (k % 9) * 4);
      const batch = analyzeWithDecisions(jd, decisions);
      expect(done.report).toEqual({ ...batch, mode: 'model' });
      expectStreamEqualsFinal(rows, done.report.requirements);
      expect(done.stats).toMatchObject({ candidates: n, decidedByModel: n });
    }
  });

  it('the long JD really exercises the cap, and still streams rows before the end', async () => {
    const seg = segmentJd(LONG_JD);
    expect(seg.candidates.length).toBe(40);
    const all = randomDecisions(40, 7, 1);
    const posted: { at: number; row: number }[] = [];
    const doc = JSON.stringify({ decisions: all });
    let fed = 0;
    const deps: RunDeps = {
      engine: {
        async *stream() {
          for (const ch of doc) {
            fed++;
            yield { delta: ch };
          }
        },
        interrupt() {},
      },
      post: (m) => {
        if (m.type === 'row') posted.push({ at: fed, row: m.index });
      },
      validateJd,
      segmentJd,
      buildMessages: buildDecisionMessages,
      defaultDecision,
      mergeOne,
      mergeDecisions,
      prepareExtraction,
      judgeRequirement: (req) => judgeRequirement(req),
      judge: (x) => judge(x),
      reportCoverage,
    };
    await runExtraction(1, LONG_JD, deps).done;
    expect(mergeDecisions(seg, all).requirements).toHaveLength(MAX_REQUIREMENTS);
    // Must-haves are certain survivors as soon as they're decided.
    expect(posted[0].at).toBeLessThan(doc.length / 10);
  });
});

describe('capFate', () => {
  it('must-haves: kept while fewer than the cap precede them', () => {
    expect(capFate('must', 24, 99, 99, 99, 25)).toBe('kept');
    expect(capFate('must', 25, 0, 25, 0, 25)).toBe('dropped');
  });
  it('nice-to-haves: settled only when the undecided rest cannot change the answer', () => {
    expect(capFate('nice', 0, 3, 10, 11, 25)).toBe('kept'); // 10 + 11 + 3 = 24 < 25
    expect(capFate('nice', 0, 3, 10, 12, 25)).toBe('unknown'); // could be 25
    expect(capFate('nice', 0, 5, 20, 0, 25)).toBe('dropped'); // 20 + 5 ≥ 25
  });
});
