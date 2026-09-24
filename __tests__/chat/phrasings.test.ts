import { describe, expect, it } from 'vitest';

import { answerWithCalls } from '@/lib/chat/answer';

import { PHRASINGS, type Phrasing } from '../../evals/chat/phrasings';

/**
 * Router accuracy for the model-free chat, on the labelled phrasings in
 * evals/chat/phrasings.ts. A phrasing passes when the reply kind matches
 * and, where labelled, the skills (as a set), the project id and the
 * profile topic match too.
 *
 * The split is declared in the phrasings file. `tune` phrasings are the ones
 * the router was changed against, so they must all pass.
 *
 * FIRST-RUN (HELD-OUT) ACCURACY, 2026-09-24, the numbers to quote:
 *   holdout   45 / 49 (91.8%)  before its failures were read
 *   holdout2  24 / 30 (80.0%)  written after holdout was spent, run once
 * Spike router (routeMessage, reply kind only, before this work):
 *   tune 40 / 49, holdout 38 / 49.
 * Each set's failures were then fixed (see the phrasings file header), so
 * both are tuning data now and must pass in full like `tune`: the floors
 * below guard against regressions, they are not accuracy estimates.
 */

export function check(p: Phrasing): { ok: boolean; got: string } {
  const { reply, intent } = answerWithCalls(p.message);
  const problems: string[] = [];
  if (reply.kind !== p.expect) problems.push(`kind ${reply.kind}`);
  if (p.skills) {
    const asked = intent.kind === 'skills' ? intent.asked.map((s) => s.id).sort() : [];
    if (JSON.stringify(asked) !== JSON.stringify([...p.skills].sort())) problems.push(`skills [${asked.join(', ')}]`);
  }
  if (p.project && !(intent.kind === 'project' && intent.id === p.project)) {
    problems.push(`project ${intent.kind === 'project' ? intent.id : '-'}`);
  }
  if (p.topic && !(intent.kind === 'profile' && intent.topic === p.topic)) {
    problems.push(`topic ${intent.kind === 'profile' ? intent.topic : '-'}`);
  }
  if (p.leading !== undefined && 'leading' in intent && intent.leading !== p.leading) problems.push(`leading ${intent.leading}`);
  return { ok: problems.length === 0, got: problems.join('; ') };
}

const TUNE = PHRASINGS.filter((p) => p.split === 'tune');
const HOLDOUT = PHRASINGS.filter((p) => p.split === 'holdout');
const HOLDOUT2 = PHRASINGS.filter((p) => p.split === 'holdout2');

export const HOLDOUT_FLOOR = 1;
export const HOLDOUT2_FLOOR = 1;

describe('chat router phrasings', () => {
  it('has at least 40 phrasings in each half of the split', () => {
    expect(TUNE.length).toBeGreaterThanOrEqual(40);
    expect(HOLDOUT.length).toBeGreaterThanOrEqual(40);
  });

  it.each(TUNE.map((p) => [p.message.split('\n')[0].slice(0, 60), p] as const))('tune: %s', (_label, p) => {
    const r = check(p);
    expect(r.ok, r.got).toBe(true);
  });

  it(`first held-out set accuracy is at least ${HOLDOUT_FLOOR * 100}%`, () => {
    const passed = HOLDOUT.filter((p) => check(p).ok).length;
    const accuracy = passed / HOLDOUT.length;
    console.info(`chat router held-out accuracy: ${passed}/${HOLDOUT.length} (${(accuracy * 100).toFixed(1)}%)`);
    expect(accuracy).toBeGreaterThanOrEqual(HOLDOUT_FLOOR);
  });

  it(`second held-out set accuracy is at least ${HOLDOUT2_FLOOR * 100}%`, () => {
    const passed = HOLDOUT2.filter((p) => check(p).ok).length;
    const accuracy = passed / HOLDOUT2.length;
    console.info(`chat router holdout2 accuracy: ${passed}/${HOLDOUT2.length} (${(accuracy * 100).toFixed(1)}%)`);
    expect(accuracy).toBeGreaterThanOrEqual(HOLDOUT2_FLOOR);
  });
});
