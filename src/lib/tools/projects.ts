import { CORPUS, type Evidence } from '@/data/corpus';
import { RESUME_DATA } from '@/data/resumeData';
import { WORK_PROJECTS } from '@/data/workProjects';

/**
 * WHAT A "PROJECT" IS, for list_projects and get_project.
 *
 * One project per `entry` that the corpus cites: every distinct
 * `Evidence.entry`, in corpus order. That is the four Work cards, the résumé
 * roles and the other résumé projects that have at least one sourced record.
 * Nothing is authored here; each field is read from data the site already
 * renders:
 *
 *   - a Work card (workProjects.ts) supplies the name, description and links,
 *     and is marked `featured`, because it is one of the four the site leads with;
 *   - otherwise the résumé entry (resumeData.ts) supplies title and summary,
 *     and the links are the evidence records' own sources.
 *
 * Roles are included, marked `kind: "role"`, because that is where most of the
 * work lives: OneHost and module federation are an Indeed role, not a side
 * project, and an agent filtering by "mfe" should find it.
 *
 * Left out: entries with no evidence (the profile, contact and skill entries,
 * which are keyword lists, and `combat_system`, which repeats r3f-projectiles
 * and cites nothing of its own). A project with nothing checkable behind it
 * is not one an agent should repeat.
 */
export interface Project {
  id: string;
  kind: 'role' | 'project';
  name: string;
  /** Employer for a role; publisher or venue for a project. */
  context: string | null;
  period: string | null;
  summary: string;
  /** Where to check the work. Empty when nothing is public. */
  links: { label: string; href: string }[];
  /** Why `links` is empty, when it is. */
  linkNote?: string;
  /** Canonical skill tags, the union of its evidence records' tags. */
  skills: string[];
  evidenceIds: string[];
  /** One of the Work cards the site features. */
  featured: boolean;
}

function unique<T>(items: readonly T[], key: (item: T) => string = String): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildProject(id: string, evidence: readonly Evidence[]): Project {
  const card = WORK_PROJECTS.find((p) => p.id === id);
  const entry = RESUME_DATA[id];
  const name = card?.name ?? entry?.title;
  const summary = card?.description ?? entry?.summary;
  if (!name || !summary) throw new Error(`Evidence cites "${id}", which has no card or résumé entry`);

  return {
    id,
    kind: entry?.type === 'work' ? 'role' : 'project',
    name,
    context: entry?.company || null,
    period: entry?.dates || evidence.find((e) => e.period)?.period || null,
    summary,
    links: card
      ? card.links.map(({ label, href }) => ({ label, href }))
      : unique(evidence.map((e) => e.source), (s) => s.href),
    ...(card?.linkNote ? { linkNote: card.linkNote } : {}),
    skills: unique(evidence.flatMap((e) => e.skills)),
    evidenceIds: evidence.map((e) => e.id),
    featured: Boolean(card),
  };
}

const BY_ENTRY = new Map<string, Evidence[]>();
for (const e of CORPUS.evidence) {
  const list = BY_ENTRY.get(e.entry) ?? [];
  list.push(e);
  BY_ENTRY.set(e.entry, list);
}

export const PROJECTS: readonly Project[] = [...BY_ENTRY].map(([id, evidence]) =>
  buildProject(id, evidence),
);

export const PROJECT_IDS: readonly string[] = PROJECTS.map((p) => p.id);

export function evidenceFor(projectId: string): Evidence[] {
  return BY_ENTRY.get(projectId) ?? [];
}
