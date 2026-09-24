import { describe, expect, it } from 'vitest';

import { planChat, thirdPerson, type ChatContext } from '@/lib/chat';

import { FIXTURES } from '../fit/fixtures';

function ctx(message: string): ChatContext {
  const plan = planChat(message);
  if (!('ctx' in plan)) throw new Error(`no context for ${message}`);
  return plan.ctx;
}

describe('thirdPerson', () => {
  it('names Kaleb once, then says he', () => {
    expect(thirdPerson('As tech lead, I led my team’s migration and I automated it.')).toBe(
      'As tech lead, Kaleb led his team’s migration and he automated it.',
    );
    expect(thirdPerson('The pipeline is covered by 149 passing tests.')).toBe('The pipeline is covered by 149 passing tests.');
  });
});

describe('buildContext', () => {
  it('says NO EVIDENCE for a gap term and lists it as unsupported', () => {
    const c = ctx('Has he used Kubernetes?');
    expect(c.text).toContain('Kubernetes: NO EVIDENCE');
    expect(c.facts.unsupportedSkills).toEqual(['kubernetes']);
    expect(c.facts.hasEvidence).toBe(false);
  });

  it('keeps first person out of TOOL_OUTPUT', () => {
    for (const m of ['Has he worked with React?', 'Who is Kaleb?', 'Tell me about r3f-projectiles.', FIXTURES[3].jd]) {
      expect(ctx(m).text).not.toMatch(/\b(?:I|my|I’ve)\b/);
    }
  });

  it('gives check_fit rows with verdicts and short evidence labels only', () => {
    const c = ctx(FIXTURES[3].jd); // poor-match-backend
    expect(c.text).toMatch(/^COVERAGE: .* covered$/m);
    expect(c.text).toMatch(/^- must \| gap \| .*Go.* \| no evidence$/m);
    expect(c.text).not.toContain('http');
    expect(c.facts.unsupportedSkills).toEqual(expect.arrayContaining(['go', 'kubernetes']));
    expect(c.facts.allMustStrong).toBe(false);
  });

  it('states career length on a years-only row instead of "no evidence"', () => {
    const c = ctx(FIXTURES.find((f) => f.name === 'ai-platform')!.jd);
    expect(c.text).toMatch(/^- must \| strong \| 5\+ years of software engineering \| career length: \d+ years in software since 2018/m);
    expect(c.text).not.toMatch(/\| strong \| .* \| no evidence$/m);
  });

  it('keeps prompts small', () => {
    for (const f of FIXTURES) expect(ctx(f.jd).text.length).toBeLessThan(3_500);
    expect(ctx('Has he worked with React?').text.length).toBeLessThan(1_500);
  });
});
