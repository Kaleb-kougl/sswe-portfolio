import { describe, expect, it } from 'vitest';

import { CORPUS } from '@/data/corpus';
import { ToolInputError, runTool } from '@/lib/tools';

import { PHONE } from './helpers';

type Search = {
  interpretedAs: { skills: string[]; unknownSkills: string[]; keywords: string[] };
  total: number;
  results: { id: string; score: number; matchedSkills: string[]; source: { href: string } }[];
};
const search = (input: object) => runTool('search_evidence', input) as Search;
const ids = (s: Search) => s.results.map((r) => r.id);

const ONEHOST = ['indeed-sr-swe.onehost-lead', 'indeed-sr-swe.onehost-architecture'];

describe('search_evidence', () => {
  it('finds OneHost for the skill alias "mfe"', () => {
    const s = search({ skills: ['mfe'] });
    expect(s.interpretedAs.skills).toEqual(['module-federation']);
    expect(ids(s).slice(0, 2).sort()).toEqual([...ONEHOST].sort());
    expect(ids(s).every((id) => id.startsWith('indeed-sr-swe.'))).toBe(true);
  });

  it('finds OneHost for the free-text query "module federation"', () => {
    const s = search({ query: 'module federation' });
    expect(s.interpretedAs.skills).toContain('module-federation');
    expect(ids(s).slice(0, 2).sort()).toEqual([...ONEHOST].sort());
  });

  it('reads skill names inside a sentence', () => {
    const s = search({ query: 'What has Kaleb built with module federation?' });
    expect(ids(s).slice(0, 2).sort()).toEqual([...ONEHOST].sort());
  });

  it('ranks records matching more skills first', () => {
    const s = search({ skills: ['webpack', 'module federation'] });
    const scores = s.results.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(ONEHOST).toContain(s.results[0].id);
    expect(s.results[0].matchedSkills.length).toBeGreaterThanOrEqual(1);
  });

  it('matches keywords in claims and metrics, including prefixes', () => {
    expect(ids(search({ query: 'bundle' }))).toContain('ibm-staff-swe.bundle-size');
    expect(ids(search({ query: 'migrat' }))).toContain('indeed-sr-swe.luxon-migration');
    expect(ids(search({ query: '680M' }))).toContain('indeed-swe-ii.apply-flow-tti');
  });

  it('understands accessibility aliases', () => {
    expect(ids(search({ skills: ['a11y'] }))).toEqual(['indeed-swe-ii.wcag-components', 'portfolio-site.cross-browser-a11y']);
  });

  it('reports unknown skills and returns nothing for them', () => {
    const s = search({ skills: ['cobol'] });
    expect(s.interpretedAs.unknownSkills).toEqual(['cobol']);
    expect(s.results).toEqual([]);
    expect(s.total).toBe(0);
  });

  it('returns records with their source links', () => {
    for (const r of search({ query: 'react' }).results) expect(r.source.href).toMatch(/^https:\/\//);
  });

  it('respects the limit but reports the total', () => {
    const s = search({ skills: ['typescript'], limit: 2 });
    expect(s.results).toHaveLength(2);
    expect(s.total).toBe(CORPUS.evidence.filter((e) => e.skills.includes('typescript')).length);
  });

  it('refuses an empty search', () => {
    expect(() => search({})).toThrow(ToolInputError);
    expect(() => search({ query: '  ?! ' })).toThrow(/Pass `skills`/);
  });

  it('never returns the phone number', () => {
    for (const input of [{ query: 'phone contact email' }, { skills: CORPUS.skills.map((s) => s.id).slice(0, 20) }]) {
      expect(JSON.stringify(search(input))).not.toMatch(PHONE);
    }
  });
});
