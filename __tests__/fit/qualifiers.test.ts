import { describe, expect, it } from 'vitest';

import { CORPUS, type Corpus, type Evidence } from '@/data/corpus';
import type { ExtractedRequirement } from '@/lib/fit/contract';
import { judgeRequirement, NOTE_MAX_CHARS } from '@/lib/fit/judge';
import { detectQualifiers, fromEmployment, statedSizes, uncoveredQualifiers } from '@/lib/fit/qualifiers';

/*
 * Every requirement below is invented for these tests; none is quoted from a
 * real posting.
 */

const NOW = new Date('2026-09-23T12:00:00Z');

function req(overrides: Partial<ExtractedRequirement> = {}): ExtractedRequirement {
  return { text: 'A requirement', priority: 'must', skills: [], otherSkills: [], minYears: null, ...overrides };
}

const judgeReal = (r: Partial<ExtractedRequirement>) => judgeRequirement(req(r), CORPUS, NOW);
const ids = (text: string) => detectQualifiers(text).map((q) => q.id.replace(/:\d+$/, ''));
const kinds = (text: string) => detectQualifiers(text).map((q) => q.kind);

function ev(id: string, skills: string[], claim: string, metric?: string): Evidence {
  return {
    id,
    entry: id.split('.')[0],
    claim,
    skills,
    ...(metric ? { metric } : {}),
    source: { label: `Source of ${id}`, href: `https://example.com/${id}` },
  };
}

describe('detecting qualifiers', () => {
  it('finds domains, including through synonyms', () => {
    expect(ids('Built payment APIs for an online store')).toContain('domain:payments');
    expect(ids('Background in fintech or capital markets')).toEqual(['domain:fintech']);
    expect(ids('Worked on ad tech or advertiser tools')).toEqual(['domain:ads']);
    expect(ids('Shipped titles at a game studio')).toEqual(['domain:games']);
    expect(ids('Clinical software under HIPAA')).toEqual(['domain:healthcare']);
  });

  it('finds scale: stated sizes, magnitude words and generic phrases', () => {
    expect(kinds('Services used by 10M+ users')).toEqual(['scale']);
    expect(kinds('Handled billions of events a day')).toEqual(['scale']);
    expect(kinds('Frontends for high-traffic sites')).toEqual(['scale']);
    expect(kinds('Distributed systems at scale')).toEqual(['scale']);
    expect(kinds('Pipelines over petabytes of logs')).toEqual(['scale']);
  });

  it('finds settings and depth', () => {
    expect(ids('Ran React apps in production')).toEqual(['setting:production']);
    expect(ids('Two years at an early-stage startup')).toEqual(['setting:startup']);
    expect(ids('Built B2B SaaS dashboards')).toEqual(['setting:b2b', 'setting:saas']);
    expect(ids('Expert in React')).toEqual(['depth:expert']);
    expect(ids('Deep knowledge of browser rendering')).toEqual(['depth:expert']);
    expect(ids('Led the design of our public API')).toEqual(['depth:lead']);
  });

  it('finds nothing in a qualifier-free requirement', () => {
    expect(detectQualifiers('Experience with TypeScript and Node.js')).toEqual([]);
    expect(detectQualifiers('Strong React skills and a proficient tester')).toEqual([]);
  });

  describe('negatives', () => {
    it('"production" as a quality bar is not a setting', () => {
      // "Production-quality code" is about craft, which the skill evidence
      // speaks to; it doesn't ask where the code ran.
      expect(detectQualifiers('Writes clean, production-quality code')).toEqual([]);
      expect(detectQualifiers('Takes prototypes to production-ready components')).toEqual([]);
      expect(detectQualifiers('Production-grade TypeScript')).toEqual([]);
    });

    it('"scale" as proportion, and "scalable" as a design goal, are not scale', () => {
      expect(detectQualifiers('Reads architectural drawings at scale 1:50')).toEqual([]);
      expect(detectQualifiers('Builds 3D models at scale of the real site')).toEqual([]);
      expect(detectQualifiers('Designs scalable, maintainable APIs')).toEqual([]);
    });

    it('headcount and team members are not an audience', () => {
      expect(detectQualifiers('Managed a team of 5 people')).toEqual([]);
      expect(detectQualifiers('Mentors 3+ team members')).toEqual([]);
    });

    it('lookalike words are not domains', () => {
      expect(detectQualifiers('A game-changer for developer tooling')).toEqual([]);
      expect(detectQualifiers("Bachelor's degree or equivalent education")).toEqual([]);
      expect(detectQualifiers('Kafka or another event streaming platform')).toEqual([]);
      expect(detectQualifiers('Programmatic access through REST APIs')).toEqual([]);
      expect(detectQualifiers('Fast startup time for the CLI')).toEqual([]);
      expect(detectQualifiers('Work with domain experts to refine the model')).toEqual([]);
    });

    it('a qualifier the posting waives is not asked', () => {
      expect(detectQualifiers('No prior fintech experience required')).toEqual([]);
      expect(detectQualifiers('Games experience is not required')).toEqual([]);
    });
  });
});

describe('sizes a record states', () => {
  it('reads kind and size', () => {
    expect(statedSizes('15% faster Time to Interactive for 680M+ users')).toEqual([{ kind: 'audience', size: 680e6 }]);
    expect(statedSizes('20+ components used by 5 teams')).toEqual([
      { kind: 'org', size: 20 },
      { kind: 'org', size: 5 },
    ]);
    expect(statedSizes('thousands of merchants')).toEqual([{ kind: 'audience', size: 1e3 }]);
    expect(statedSizes('553 assertions across 13 spec files')).toEqual([]);
  });
});

describe('coverage against the real corpus', () => {
  it('a domain is covered by a cited record that names it or a synonym', () => {
    const extension = CORPUS.evidence.filter((e) => e.id === 'analytics-extension.troubleshooting-time');
    expect(uncoveredQualifiers('Built tools for ads teams', extension)).toEqual([]);
    const game = CORPUS.evidence.filter((e) => e.entry === 'hammerball');
    expect(uncoveredQualifiers('Shipped multiplayer games', game)).toEqual([]);
    expect(uncoveredQualifiers('Built payment systems', game).map((q) => q.id)).toEqual(['domain:payments']);
  });

  it('employment is read from the work history, not hard-coded', () => {
    const byId = new Map(CORPUS.evidence.map((e) => [e.id, e]));
    expect(fromEmployment(byId.get('indeed-swe-ii.apply-flow-tti')!)).toBe(true);
    expect(fromEmployment(byId.get('analytics-extension.single-click')!)).toBe(true);
    expect(fromEmployment(byId.get('r3f-projectiles.engine')!)).toBe(false);
    expect(fromEmployment(byId.get('hammerball.ecs-architecture')!)).toBe(false);
  });
});

describe('the verdict cap', () => {
  it('payments/fintech with generic API evidence: strong becomes partial, and the note says why', () => {
    const plain = judgeReal({ text: 'Design APIs', skills: ['api-design'] });
    expect(plain.verdict).toBe('strong');
    const row = judgeReal({ text: 'Built payment APIs used by thousands of merchants', skills: ['api-design'] });
    expect(row.verdict).toBe('partial');
    expect(row.evidenceIds).toEqual(plain.evidenceIds);
    expect(row.note).toMatch(/Nothing for payments\./);
    expect(row.note).toMatch(/No evidence at that scale\./);
    expect(judgeReal({ text: 'API design experience in fintech', skills: ['api-design'] }).note).toMatch(/Nothing for fintech\./);
  });

  it('"millions of users" is covered by the 680M+ metric: stays strong', () => {
    const row = judgeReal({ text: 'Improved web performance for millions of users', skills: ['web-performance'] });
    expect(row.evidenceIds).toContain('indeed-swe-ii.apply-flow-tti');
    expect(row.verdict).toBe('strong');
    expect(row.note).not.toMatch(/scale/);
  });

  it('a stated size larger than the evidence is not covered', () => {
    expect(judgeReal({ text: 'Web performance for billions of users', skills: ['web-performance'] }).verdict).toBe('partial');
  });

  it('a size of another kind does not cover: users are not requests', () => {
    expect(judgeReal({ text: 'Web performance at 1M requests per second', skills: ['web-performance'] }).verdict).toBe('partial');
  });

  it('"expert in React" with only records lacking a metric or lead role: partial', () => {
    const corpus: Corpus = {
      ...CORPUS,
      evidence: [
        ev('x.one', ['react'], 'I built a settings page in React.'),
        ev('x.two', ['react'], 'I added a date picker to a React form.'),
      ],
    };
    const plain = judgeRequirement(req({ text: 'React', skills: ['react'] }), corpus, NOW);
    expect(plain.verdict).toBe('strong');
    const expert = judgeRequirement(req({ text: 'Expert in React', skills: ['react'] }), corpus, NOW);
    expect(expert.verdict).toBe('partial');
    expect(expert.note).toMatch(/No metric or lead role/);
  });

  it('"expert in React" against the real corpus: the metric\'d component work covers it', () => {
    expect(judgeReal({ text: 'Expert in React', skills: ['react'] }).verdict).toBe('strong');
  });

  it('"led the design of" needs a lead or architecture record, not just a metric', () => {
    const corpus: Corpus = {
      ...CORPUS,
      evidence: [ev('x.one', ['api-design'], 'I designed a small API.', '7 endpoints'), ev('x.two', ['api-design'], 'I wrote an SDK.')],
    };
    expect(judgeRequirement(req({ text: 'Led the design of public APIs', skills: ['api-design'] }), corpus, NOW).verdict).toBe('partial');
    const led: Corpus = { ...corpus, evidence: [...corpus.evidence, ev('x.three', ['api-design'], 'I led the API redesign.')] };
    expect(judgeRequirement(req({ text: 'Led the design of public APIs', skills: ['api-design'] }), led, NOW).verdict).toBe('strong');
  });

  it('"in production" needs a cited record from employment', () => {
    // Only personal projects carry these tags.
    expect(judgeReal({ text: 'Shipped Three.js scenes', skills: ['threejs'] }).verdict).toBe('strong');
    const row = judgeReal({ text: 'Shipped Three.js scenes in production', skills: ['threejs'] });
    expect(row.verdict).toBe('partial');
    expect(row.note).toMatch(/None of it from a job in production\./);
    expect(judgeReal({ text: 'React apps in production', skills: ['react'] }).verdict).toBe('strong');
  });

  it('a qualifier-free requirement is unchanged', () => {
    for (const skills of [['react'], ['typescript'], ['api-design'], ['graphql'], ['postgresql']]) {
      const text = 'Experience with the listed tools';
      expect(judgeReal({ text, skills })).toEqual({ ...judgeReal({ text: 'x', skills }), text });
    }
  });

  it('never raises a verdict: partial stays partial and gets the note, gap stays gap', () => {
    const partial = judgeReal({ text: 'Microservices at scale', skills: ['microservices'] });
    expect(partial.verdict).toBe('partial');
    expect(partial.note).toMatch(/No evidence at that scale\./);
    const gap = judgeReal({ text: 'Payments at scale in Go', otherSkills: ['Go'] });
    expect(gap.verdict).toBe('gap');
    expect(gap.note).not.toMatch(/payments|scale/);
    expect(judgeReal({ text: 'Payments experience' }).verdict).toBe('not_assessed');
  });

  it('a years-only row checks its qualifiers against the whole career', () => {
    expect(judgeReal({ text: '5+ years of software engineering', minYears: 5 }).verdict).toBe('strong');
    expect(judgeReal({ text: '5+ years of professional experience building production systems', minYears: 5 }).verdict).toBe('strong');
    const fintech = judgeReal({ text: '5+ years in fintech', minYears: 5 });
    expect(fintech.verdict).toBe('partial');
    expect(fintech.note).toMatch(/meets the 5 asked\. Nothing for fintech\.$/);
    expect(judgeReal({ text: '12+ years in fintech', minYears: 12 }).verdict).toBe('gap');
  });

  it('keeps the note within the contract limit when everything is missing', () => {
    const text =
      'Expert who led the design of B2B SaaS payment, healthcare, insurance and crypto platforms at an early-stage startup, in production, for billions of users';
    const row = judgeReal({ text, skills: ['react', 'typescript', 'node-js'], otherSkills: ['Go', 'Rust'], minYears: 20 });
    expect(row.verdict).toBe('partial');
    expect(row.note.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
  });
});
