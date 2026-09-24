import { describe, it, expect } from 'vitest';

import type { Segment } from '@/lib/fit/contract';
import { defaultDecision } from '@/lib/fit/merge';
import { segmentJd } from '@/lib/fit/segment';
import {
  containsPhrase,
  MAX_PROPOSALS,
  proposeSkills,
  routeReasons,
  scoreProposals,
  stem,
  tokens,
  uncertainSegments,
} from '@/lib/fit/route';

import { FIXTURES, idealDecisions } from './fixtures';

/**
 * v2 routing (plan 2f): which candidates code is unsure about, and which
 * skills it might have missed. Pure; the worker, the evals and the sweep
 * all rely on these being deterministic.
 */

const seg = (text: string, extra: Partial<Segment> = {}): Segment => ({
  index: 0,
  text,
  section: 'requirements',
  priority: 'must',
  skills: [],
  otherSkills: [],
  minYears: null,
  ...extra,
});

describe('routeReasons: one rule each', () => {
  it('unknown section: always routed', () => {
    expect(routeReasons(seg('Go experience required', { section: 'unknown', priority: 'must', otherSkills: ['Go'] }), true)).toEqual([
      'unknown-section',
    ]);
  });

  it('requirements / preferred with no skill and no years: bare-requirement', () => {
    expect(routeReasons(seg('Excellent written communication'), false)).toEqual(['bare-requirement']);
    expect(routeReasons(seg('Bazel experience', { section: 'preferred', priority: 'nice' }), false)).toEqual(['bare-requirement']);
    expect(routeReasons(seg('React', { skills: ['react'] }), false)).toEqual([]);
    expect(routeReasons(seg('Kafka', { otherSkills: ['Kafka'] }), false)).toEqual([]);
    expect(routeReasons(seg('5+ years of engineering', { minYears: 5 }), false)).toEqual([]);
  });

  it('intro or duty in a requirements list: company voice, you will, blurbs, long first sentences', () => {
    const r = (text: string, first = false) => routeReasons(seg(text, { skills: ['react'] }), first);
    expect(r("We're a React shop that ships daily")).toEqual(['intro-or-duty']);
    expect(r('Our frontend is React')).toEqual(['intro-or-duty']);
    expect(r("You'll own the React checkout")).toEqual(['intro-or-duty']);
    expect(r('You will own the React checkout')).toEqual(['intro-or-duty']);
    expect(r('React experience, in any of:')).toEqual(['intro-or-duty']);
    expect(r('React. '.repeat(50))).toEqual(['intro-or-duty']);
    const intro = 'In this role you bring deep React skills to a team that cares about craft.';
    expect(r(intro, true)).toEqual(['intro-or-duty']);
    expect(r(intro, false)).toEqual([]);
    expect(r('Strong React skills', true)).toEqual([]);
  });

  it('responsibilities: routed only when they name a skill', () => {
    const duty = (extra: Partial<Segment>) => routeReasons(seg('Own the checkout', { section: 'responsibilities', priority: null, ...extra }), false);
    expect(duty({ skills: ['react'] })).toEqual(['duty-names-skill']);
    expect(duty({ otherSkills: ['Java'] })).toEqual(['duty-names-skill']);
    expect(duty({})).toEqual([]);
  });

  it('about and benefits never route (they are not candidates anyway)', () => {
    expect(routeReasons(seg('We are great', { section: 'about', priority: null }), true)).toEqual([]);
    expect(routeReasons(seg('401(k)', { section: 'benefits', priority: null }), true)).toEqual([]);
  });

  it('several rules can apply to one segment', () => {
    expect(routeReasons(seg("You'll be comfortable in ambiguity"), false)).toEqual(['bare-requirement', 'intro-or-duty']);
  });
});

describe('uncertainSegments on the fixtures', () => {
  /**
   * How many of each fixture's candidates reach the requirement question.
   * Three dropped by one when Next.js, GitHub Actions and the wider gap
   * vocabulary (Google Analytics, Nx) let code name the skill itself.
   */
  const ROUTED: Record<string, [routed: number, candidates: number]> = {
    'frontend-senior': [2, 11],
    'fullstack-senior': [2, 10],
    'ai-platform': [3, 11],
    'poor-match-backend': [2, 9],
    'non-engineering-marketing': [5, 8],
    'prose-only-startup': [10, 10],
    'responsibilities-tech': [4, 11],
    'boilerplate-payments': [7, 11],
  };

  it.each(FIXTURES)('$name', (f) => {
    const s = segmentJd(f.jd);
    const routed = uncertainSegments(s);
    expect([routed.length, s.candidates.length]).toEqual(ROUTED[f.name]);
    // A subset of the candidates, in document order.
    expect(routed.every((i) => s.candidates.includes(i))).toBe(true);
    expect([...routed].sort((a, b) => a - b)).toEqual(routed);
  });

  it("every keep/drop call code gets wrong on the fixtures is routed or has a proposal (the model gets a chance)", () => {
    const unreachable: string[] = [];
    let wrong = 0;
    for (const f of FIXTURES) {
      const s = segmentJd(f.jd);
      const ideal = idealDecisions(f, s);
      const routed = new Set(uncertainSegments(s));
      s.candidates.forEach((index, pos) => {
        const segment = s.segments[index];
        if (defaultDecision(segment).requirement === ideal[pos].requirement) return;
        wrong++;
        if (!routed.has(index) && proposeSkills(segment).length === 0) unreachable.push(`${f.name}: ${segment.text}`);
      });
    }
    expect(wrong).toBe(3);
    expect(unreachable).toEqual([]);
  });
});

describe('stem and tokens', () => {
  it('lines up the word families the proposals rely on', () => {
    const same = (...words: string[]) => expect(new Set(words.map(stem)).size, words.join(' / ')).toBe(1);
    same('mentor', 'mentored', 'mentoring', 'mentorship', 'mentors');
    same('migrate', 'migration', 'migrations', 'migrating');
    same('test', 'tests', 'testing', 'tested');
    same('lead', 'led', 'leading', 'leader', 'leadership');
    same('access', 'accessible', 'accessibility');
    same('API', 'APIs', 'api');
    same('tech', 'technical');
    same('automated', 'automation');
    same('service', 'services');
    same('vital', 'vitals');
    expect(stem('process')).toBe('process');
    expect(stem('processes')).toBe('process');
    expect(stem('status')).toBe('status');
    expect(stem('vite')).not.toBe(stem('vitals'));
  });

  it('keeps ".js" names whole and "+"/"#" languages intact', () => {
    expect(tokens('Node.js and C++ or C#, with Next.js')).toEqual(['node.js', 'and', 'c++', 'or', 'c#', 'with', 'next.js']);
  });

  it('containsPhrase allows one extra word between phrase words, in order', () => {
    const h = 'run a small team of engineers'.split(' ');
    expect(containsPhrase(h, ['run', 'a', 'team'])).toBe(true);
    expect(containsPhrase(h, ['run', 'team'])).toBe(false); // two words apart
    expect(containsPhrase(h, ['team', 'run'])).toBe(false);
    expect(containsPhrase(h, [])).toBe(false);
  });
});

describe('proposeSkills', () => {
  it('finds the synonyms the plan names', () => {
    expect(proposeSkills(seg('Design REST APIs for partners'))).toContain('api-design');
    expect(proposeSkills(seg('You have mentored junior developers'))).toContain('mentoring');
    expect(proposeSkills(seg('Build UIs that work with screen readers'))).toContain('wcag');
  });

  it('never proposes a skill code already found, and at most MAX_PROPOSALS', () => {
    expect(proposeSkills(seg('Designing REST APIs', { skills: ['api-design'] }))).not.toContain('api-design');
    const busy = seg('Lead and mentor engineers, design REST APIs, migrate legacy code, improve build times, write tests, screen reader support');
    expect(scoreProposals(busy.text).length).toBeGreaterThan(MAX_PROPOSALS);
    expect(proposeSkills(busy)).toHaveLength(MAX_PROPOSALS);
  });

  it('ignores words the scan already attributed, and names that only contain a word', () => {
    // "design system" is design-systems (found); it is not also system-design.
    expect(proposeSkills(seg('Built a design system', { skills: ['design-systems'] }))).not.toContain('system-design');
    // "React Testing Library" is a library's name, not a testing requirement by itself.
    expect(proposeSkills(seg('React Testing Library'))).toEqual([]);
    // "Node.js" is not "JS".
    expect(proposeSkills(seg('Node.js services', { skills: ['node-js'] }))).not.toContain('javascript');
    // Ambiguous scan stop terms: "three time zones" is not Three.js.
    expect(proposeSkills(seg('Remote across three time zones'))).toEqual([]);
  });

  it('a common word alone is not enough ("build", "platform", "team")', () => {
    expect(proposeSkills(seg('Build features for customers'))).toEqual([]);
    expect(proposeSkills(seg('Join the platform team'))).toEqual([]);
  });

  it('proposes every labelled skill code missed on the fixtures (8 of 8), with few proposals overall', () => {
    let gold = 0;
    let hits = 0;
    let proposals = 0;
    const misses: string[] = [];
    for (const f of FIXTURES) {
      const s = segmentJd(f.jd);
      const ideal = idealDecisions(f, s);
      s.candidates.forEach((index, pos) => {
        const got = proposeSkills(s.segments[index]);
        proposals += got.length;
        for (const want of ideal[pos].addSkills) {
          gold++;
          if (got.includes(want)) hits++;
          else misses.push(`${want}: ${s.segments[index].text}`);
        }
      });
    }
    expect(misses).toEqual([]);
    expect([hits, gold]).toEqual([8, 8]);
    // 81 candidates; each proposal costs one question.
    expect(proposals).toBeLessThanOrEqual(16);
  });
});
