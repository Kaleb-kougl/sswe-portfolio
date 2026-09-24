import { describe, expect, it } from 'vitest';

import { CORPUS, normalizeSkill, skillKey } from '@/data/corpus';
import { GAP_VOCABULARY, SKILL_CATEGORIES, SKILL_CATEGORY, SKILLS_TABLE, gapTerm } from '@/data/corpus/skills';
import { entryLabel, EVIDENCE_LABELS, evidenceLabel } from '@/lib/fit/labels';

describe('skill categories', () => {
  it('gives every canonical tag a category, and nothing else one', () => {
    expect(Object.keys(SKILL_CATEGORY).sort()).toEqual(SKILLS_TABLE.map((s) => s.id).sort());
    for (const category of Object.values(SKILL_CATEGORY)) expect(SKILL_CATEGORIES).toHaveProperty(category);
  });
});

describe('gap vocabulary', () => {
  it('claims nothing the corpus claims', () => {
    for (const term of GAP_VOCABULARY) {
      for (const name of [term.id, term.label, ...term.aliases]) {
        expect(normalizeSkill(name), `${term.id}: ${name}`).toBeUndefined();
      }
    }
  });

  it('has unique ids and non-overlapping spellings', () => {
    const ids = GAP_VOCABULARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = GAP_VOCABULARY.flatMap((t) => [t.label, ...t.aliases].map((n) => skillKey(n)));
    // "C++" and "C#" both key to "c"; they are told apart by label, not key.
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual(['c']);
  });

  it('has a real category for every term', () => {
    for (const term of GAP_VOCABULARY) expect(SKILL_CATEGORIES).toHaveProperty(term.category);
  });

  it('looks terms up by any spelling, symbols included', () => {
    expect(gapTerm('golang')?.id).toBe('go');
    expect(gapTerm('C++')?.id).toBe('cpp');
    expect(gapTerm('c#')?.id).toBe('csharp');
    expect(gapTerm('.NET')?.id).toBe('dotnet');
    expect(gapTerm('C')).toBeUndefined();
    expect(gapTerm('net')).toBeUndefined();
    expect(gapTerm('HubSpot')).toBeUndefined();
  });
});

describe('evidence labels', () => {
  it('labels every record, and only records that exist', () => {
    const ids = CORPUS.evidence.map((e) => e.id);
    expect(Object.keys(EVIDENCE_LABELS).sort()).toEqual([...ids].sort());
  });

  it('keeps labels short', () => {
    for (const label of Object.values(EVIDENCE_LABELS)) expect(label.length, label).toBeLessThanOrEqual(52);
  });

  it('uses no figure the record itself does not state', () => {
    for (const e of CORPUS.evidence) {
      const source = `${e.claim} ${e.metric ?? ''}`.replace(/(\d),(?=\d{3}\b)/g, '$1');
      const figures = EVIDENCE_LABELS[e.id].replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? [];
      for (const figure of figures) expect(source, `${e.id}: ${figure}`).toContain(figure);
    }
  });

  it('falls back to the clipped claim for an unlabelled record', () => {
    expect(evidenceLabel({ id: 'x.y', claim: 'I built a thing.' })).toBe('Built a thing');
    const long = evidenceLabel({ id: 'x.y', claim: `I ${'wrote many words '.repeat(10)}` });
    expect(long.length).toBeLessThanOrEqual(49);
    expect(long.endsWith('…')).toBe(true);
  });

  it('names each entry the way a reader would', () => {
    expect(entryLabel('indeed-sr-swe')).toBe('Indeed');
    expect(entryLabel('ibm-swe')).toBe('IBM');
    expect(entryLabel('jbhunt-intern')).toBe('J.B. Hunt');
    expect(entryLabel('video-pipeline')).toBe('Agentic AI Video Creator');
    expect(entryLabel('acs-microdialysis')).toBe('Analytical Chemistry (ACS)');
    expect(entryLabel('unknown-entry')).toBe('unknown-entry');
    for (const e of CORPUS.evidence) expect(entryLabel(e.entry).length).toBeLessThanOrEqual(30);
  });
});
