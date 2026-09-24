import { describe, expect, it } from 'vitest';

import { CORPUS, normalizeSkill, skillKey } from '@/data/corpus';
import { Corpus } from '@/data/corpus/schema';
import { CONTACT_INFO, RESUME_DATA, SKILLS } from '@/data/resumeData';
import { WORK_PROJECTS } from '@/data/workProjects';

const canonical = new Set(CORPUS.skills.map((s) => s.id));

/**
 * The text a record may draw its figures from: the entry's bullets and, when
 * the entry is also a Work card, the card's description. `summary` and
 * `result` are left out on purpose — they are editorial restatements of the
 * bullets, and a metric should trace to the primary line.
 */
function sourceText(entry: string): string {
  const bullets = RESUME_DATA[entry]?.bullets ?? [];
  const card = WORK_PROJECTS.find((p) => p.id === entry)?.description ?? '';
  return [...bullets, card].join('\n');
}

/** Every number in a string, with thousands separators removed first. */
function numbersIn(text: string): string[] {
  return text.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? [];
}

describe('corpus', () => {
  it('parses against the schema', () => {
    expect(() => Corpus.parse(CORPUS)).not.toThrow();
  });

  it('has no duplicate evidence ids', () => {
    const ids = CORPUS.evidence.map((e) => e.id);
    expect(ids.length - new Set(ids).size).toBe(0);
  });

  it('prefixes every id with its entry', () => {
    for (const e of CORPUS.evidence) expect(e.id.split('.')[0], e.id).toBe(e.entry);
  });

  it('points every record at an entry that exists', () => {
    const known = new Set([...Object.keys(RESUME_DATA), ...WORK_PROJECTS.map((p) => p.id)]);
    for (const e of CORPUS.evidence) expect(known.has(e.entry), `${e.id} → ${e.entry}`).toBe(true);
  });

  it('tags evidence with canonical skills only', () => {
    for (const e of CORPUS.evidence) {
      for (const skill of e.skills) expect(canonical.has(skill), `${e.id}: ${skill}`).toBe(true);
    }
  });

  it('has no duplicate skill ids', () => {
    expect(canonical.size).toBe(CORPUS.skills.length);
  });

  it('resolves every alias to its own tag, with no two tags colliding', () => {
    for (const skill of CORPUS.skills) {
      for (const term of [skill.id, skill.label, ...skill.aliases]) {
        expect(normalizeSkill(term), `${term} (${skill.id})`).toBe(skill.id);
      }
    }
  });

  it('normalizes case, whitespace and punctuation', () => {
    expect(normalizeSkill('MFE')).toBe('module-federation');
    expect(normalizeSkill(' a11y ')).toBe('wcag');
    expect(normalizeSkill('R3F')).toBe('react-three-fiber');
    expect(normalizeSkill('Node.js')).toBe('node-js');
    expect(normalizeSkill('nodejs')).toBe('node-js');
    expect(normalizeSkill('CI / CD')).toBe('ci-cd');
    expect(normalizeSkill('cobol')).toBeUndefined();
    expect(skillKey('Next.js')).toBe('nextjs');
  });

  // SKILLS (JSON-LD knowsAbout) stays authored in resumeData.ts; see the note
  // in skills.ts. This keeps the two vocabularies from drifting apart.
  it('maps every JSON-LD knowsAbout skill to a canonical tag', () => {
    for (const s of SKILLS) expect(normalizeSkill(s), s).toBeDefined();
  });

  it('only states numbers that appear in the source entry', () => {
    for (const e of CORPUS.evidence) {
      const available = new Set(numbersIn(sourceText(e.entry)));
      for (const field of [e.metric ?? '', e.claim]) {
        for (const n of numbersIn(field)) {
          expect(available.has(n), `${e.id}: "${n}" is not in ${e.entry}'s text`).toBe(true);
        }
      }
    }
  });

  it('never carries the phone number', () => {
    // Any formatting: 479-283-4454, (479) 283 4454, 479.283.4454, 4792834454.
    const groups = CONTACT_INFO.phone.match(/\d+/g) ?? [];
    expect(groups.join('')).toHaveLength(10);
    const anyFormat = new RegExp(groups.join('\\D{0,3}'));
    expect(JSON.stringify(CORPUS)).not.toMatch(anyFormat);
  });
});
