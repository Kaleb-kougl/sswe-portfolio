import { describe, expect, it } from 'vitest';

import { CORPUS } from '@/data/corpus';
import { PROJECT_IDS, ToolInputError, runTool } from '@/lib/tools';

import { PHONE } from './helpers';

type Full = { id: string; evidence: { id: string; entry: string }[]; evidenceIds: string[] };
const get = (id: string) => runTool('get_project', { id }) as Full;

describe('get_project', () => {
  it('returns the project with all of its evidence', () => {
    const p = get('indeed-sr-swe');
    expect(p.evidence.map((e) => e.id)).toEqual(p.evidenceIds);
    expect(p.evidence.map((e) => e.id)).toContain('indeed-sr-swe.onehost-lead');
    expect(p.evidence.every((e) => e.entry === 'indeed-sr-swe')).toBe(true);
  });

  it('accounts for every evidence record exactly once across projects', () => {
    const all = PROJECT_IDS.flatMap((id) => get(id).evidence.map((e) => e.id));
    expect(all.sort()).toEqual(CORPUS.evidence.map((e) => e.id).sort());
  });

  it('forgives case, whitespace and an evidence id', () => {
    expect(get('  R3F-Projectiles ').id).toBe('r3f-projectiles');
    expect(get('indeed-sr-swe.onehost-lead').id).toBe('indeed-sr-swe');
  });

  it('rejects an unknown id with the list of valid ids', () => {
    expect(() => get('nope')).toThrow(ToolInputError);
    expect(() => get('nope')).toThrow(/No project with id "nope"/);
    for (const id of PROJECT_IDS) expect(() => get('nope')).toThrow(id);
  });

  it('rejects input that fails the schema', () => {
    expect(() => runTool('get_project', {})).toThrow(ToolInputError);
    expect(() => runTool('get_project', { id: '' })).toThrow(ToolInputError);
  });

  it('never returns the phone number', () => {
    for (const id of PROJECT_IDS) expect(JSON.stringify(get(id))).not.toMatch(PHONE);
  });
});
