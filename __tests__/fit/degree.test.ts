import { describe, expect, it } from 'vitest';

import { degreeOptional, judgeDegree, judgeRequirement, parseDegreeAsk, parseDegreePaths } from '@/lib/fit';

describe('parseDegreeAsk', () => {
  it.each([
    ["Bachelor's degree in Computer Science or equivalent experience", { level: 'bachelor', field: 'cs', equivalent: true }],
    ["Bachelor's degree in Computer Science, Engineering, or a related technical field", { level: 'bachelor', field: 'related', equivalent: false }],
    ["Bachelor's degree in Computer Science", { level: 'bachelor', field: 'cs', equivalent: false }],
    ['BS/MS in Computer Science or equivalent practical experience', { level: 'bachelor', field: 'cs', equivalent: true }],
    ["Bachelor's degree", { level: 'bachelor', field: 'any', equivalent: false }],
    ['A degree in a technical field', { level: 'bachelor', field: 'related', equivalent: false }],
    ["Master's degree in Computer Science", { level: 'master', field: 'cs', equivalent: false }],
    ['PhD in Machine Learning or equivalent experience', { level: 'doctorate', field: 'any', equivalent: true }],
  ])('%s', (text, want) => {
    expect(parseDegreeAsk(text)).toEqual(want);
  });

  it.each([
    'A degree is not required',
    'No degree required; show us what you have built',
    'Strong React and TypeScript',
    'MS Office and Google Sheets',
    'Experience with the Next.js App Router',
    'You appreciate a high degree of ownership',
  ])('asks nothing: %s', (text) => {
    expect(parseDegreeAsk(text)).toBeNull();
  });
});

describe('judgeDegree against the site’s education', () => {
  const v = (text: string) => judgeDegree(parseDegreeAsk(text)!).verdict;

  it('meets a bachelor’s with no field, a related field or equivalent experience', () => {
    expect(v("Bachelor's degree")).toBe('strong');
    expect(v("Bachelor's degree in Computer Science or a related field")).toBe('strong');
    expect(v("Bachelor's degree in Computer Science or equivalent experience")).toBe('strong');
  });

  it('is partial against a strict computer science degree', () => {
    expect(v("Bachelor's degree in Computer Science")).toBe('partial');
  });

  it('does not meet a master’s, unless equivalent experience is allowed', () => {
    expect(v("Master's degree in Computer Science")).toBe('gap');
    expect(v("Master's degree or equivalent experience")).toBe('partial');
  });

  it('names the degree and the certificate from EDUCATION', () => {
    const { note } = judgeDegree(parseDegreeAsk("Bachelor's degree in Computer Science")!);
    expect(note).toMatch(/^B\.S\. in Biological Sciences \(University of Arkansas, 2017\) and a Full-Stack Web Development certificate \(Northwestern University, 2019\)\./);
    expect(note.length).toBeLessThanOrEqual(200);
  });

  it('keeps every note within the report’s limit', () => {
    for (const text of ["Master's degree or equivalent experience", "PhD in Computer Science", "Bachelor's degree in Computer Science or a related field"]) {
      expect(judgeDegree(parseDegreeAsk(text)!).note.length, text).toBeLessThanOrEqual(200);
    }
  });
});

describe('judgeRequirement: degree rows', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const row = (text: string, minYears: number | null = null) =>
    judgeRequirement({ text, priority: 'must', skills: [], otherSkills: [], minYears }, undefined, now);

  it('assesses a degree line instead of leaving it out of coverage', () => {
    const r = row("Bachelor's degree in Computer Science or equivalent experience");
    expect(r.verdict).toBe('strong');
    expect(r.evidenceIds).toEqual([]);
  });

  it('takes the lower of the degree and the years', () => {
    expect(row("Bachelor's degree and 12+ years of experience", 12).verdict).toBe('gap');
    expect(row("Bachelor's degree and 5+ years of experience", 5).verdict).toBe('strong');
  });

  it('leaves a line that asks no degree alone', () => {
    expect(row('A degree is not required').verdict).toBe('not_assessed');
  });
});

describe('degree alternatives', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const row = (text: string, minYears: number | null = null) =>
    judgeRequirement({ text, priority: 'nice', skills: [], otherSkills: [], minYears }, undefined, now);

  it('reads degree-and-years paths', () => {
    expect(parseDegreePaths('BS and 8+ years of relevant work experience, MS and 7+ years of relevant work experience, or PhD and 4+ years')).toEqual([
      { level: 'bachelor', years: 8 },
      { level: 'master', years: 7 },
      { level: 'doctorate', years: 4 },
    ]);
    expect(parseDegreePaths("Bachelor's degree in Computer Science")).toBeNull();
    expect(parseDegreePaths('A degree is not required, 5+ years is')).toBeNull();
  });

  it('meets a line when one path is met, and says which', () => {
    const r = row('BS and 8+ years of relevant work experience, MS and 7+ years of relevant work experience, or PhD and 4+ years of relevant work experience.');
    expect(r.verdict).toBe('strong');
    expect(r.note).toMatch(/^Meets the bachelor's \+ 8 years path: B\.S\. in Biological Sciences/);
    expect(r.note.length).toBeLessThanOrEqual(200);
  });

  it('is a gap when the years fall short on every path I hold the degree for', () => {
    expect(row('BS and 15+ years of experience, or MS and 12+ years').verdict).toBe('gap');
    expect(row('MS and 3+ years, or PhD and 1+ years').verdict).toBe('gap');
  });

  it('judges a line with a no-degree path on its years alone', () => {
    const text = '8+ years of programming experience in a relevant language OR 4+ years experience with a PhD';
    expect(degreeOptional(text)).toBe(true);
    expect(parseDegreeAsk(text)).toBeNull();
    const r = row(text, 8);
    expect(r.verdict).toBe('strong');
    expect(r.note).not.toMatch(/doctorate/);
  });

  it('keeps "or equivalent experience" as a degree ask', () => {
    expect(degreeOptional("Bachelor's degree in Computer Science or 4+ years of equivalent experience")).toBe(false);
  });
});
