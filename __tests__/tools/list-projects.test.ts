import { describe, expect, it } from 'vitest';

import { CORPUS } from '@/data/corpus';
import { WORK_PROJECTS } from '@/data/workProjects';
import { PROJECTS, runTool, type Project } from '@/lib/tools';

import { PHONE } from './helpers';

type Listing = { projects: Project[]; skill?: { input: string; canonical: string | null }; note?: string };
const list = (input: object = {}) => runTool('list_projects', input) as Listing;
const ids = (l: Listing) => l.projects.map((p) => p.id);

describe('list_projects', () => {
  it('lists one project per entry the corpus cites, and nothing else', () => {
    const cited = [...new Set(CORPUS.evidence.map((e) => e.entry))];
    expect(ids(list())).toEqual(cited);
  });

  it('includes every Work card, marked featured, with the card’s own links', () => {
    for (const card of WORK_PROJECTS) {
      const project = PROJECTS.find((p) => p.id === card.id);
      expect(project, card.id).toBeDefined();
      expect(project!.featured).toBe(true);
      expect(project!.links.map((l) => l.href)).toEqual(card.links.map((l) => l.href));
    }
    expect(PROJECTS.filter((p) => p.featured)).toHaveLength(WORK_PROJECTS.length);
  });

  it('says why a card has no links', () => {
    const ext = PROJECTS.find((p) => p.id === 'analytics-extension')!;
    expect(ext.links).toEqual([]);
    expect(ext.linkNote).toMatch(/no public link/i);
  });

  it('marks résumé roles as roles', () => {
    expect(PROJECTS.find((p) => p.id === 'indeed-sr-swe')?.kind).toBe('role');
    expect(PROJECTS.find((p) => p.id === 'r3f-projectiles')?.kind).toBe('project');
  });

  it('filters by skill through aliases', () => {
    const mfe = list({ skill: 'mfe' });
    expect(mfe.skill).toEqual({ input: 'mfe', canonical: 'module-federation' });
    expect(ids(mfe)).toEqual(['indeed-sr-swe']);
    expect(ids(list({ skill: 'R3F' }))).toEqual(['r3f-projectiles']);
    expect(ids(list({ skill: 'Module Federation' }))).toEqual(['indeed-sr-swe']);
  });

  it('answers an unknown skill with no projects and a note, not an error', () => {
    const cobol = list({ skill: 'cobol' });
    expect(cobol.projects).toEqual([]);
    expect(cobol.skill?.canonical).toBeNull();
    expect(cobol.note).toMatch(/search_evidence/);
  });

  it('never returns the phone number', () => {
    for (const input of [{}, { skill: 'react' }]) expect(JSON.stringify(list(input))).not.toMatch(PHONE);
  });
});
