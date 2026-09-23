import { CORPUS, type Corpus } from '@/data/corpus';
import { RESUME_DATA, type ProjectEntry } from '@/data/resumeData';
import { MCP_URL, SITE_URL } from '@/data/site';
import { WORK_PROJECTS } from '@/data/workProjects';

/**
 * Everything `/llms.txt` and `/llms-full.txt` are rendered from, gathered in
 * one plain object so the renderers in `render.ts` stay pure: they take this
 * and return a string, with no imports of their own to reach around. The tests
 * render the real `LLMS_SOURCE`, and could render a fixture just as easily.
 *
 * Nothing here is new copy. Names, dates, summaries and links are read from
 * the corpus, resumeData.ts and workProjects.ts; the only strings authored in
 * this folder are headings and the sentences that explain the format.
 */

/** A résumé entry, reduced to what the link lists need. */
export interface LlmsEntry {
  id: string;
  title: string;
  /** Employer, or "Personal Project" etc. Empty when the entry has none. */
  company: string;
  dates: string;
  summary: string;
  type: ProjectEntry['type'];
}

/** A Work-section card: the four projects the site leads with. */
export interface LlmsCard {
  id: string;
  name: string;
  description: string;
  /** The card's first public link, or `null` for internal work. */
  href: string | null;
  /** Why there is no link, when there is none (the card's own wording). */
  linkNote?: string;
}

export interface LlmsSource {
  corpus: Corpus;
  siteUrl: string;
  mcpUrl: string;
  /** Absolute URL of the full-corpus file, for the `## Optional` link. */
  fullUrl: string;
  /** Absolute URL of the résumé PDF the contact section links to. */
  resumeUrl: string;
  /** Section anchors on the homepage, for entries with no public URL. */
  anchors: { work: string; career: string };
  cards: readonly LlmsCard[];
  /** Work history, newest first, as the career section orders it. */
  experience: readonly LlmsEntry[];
  /** Every résumé entry the corpus cites, keyed by id (evidence `entry`). */
  entries: Readonly<Record<string, LlmsEntry>>;
}

function toEntry(id: string): LlmsEntry {
  const e = RESUME_DATA[id];
  return {
    id,
    title: e.title,
    company: e.company,
    dates: e.dates,
    summary: e.summary,
    type: e.type,
  };
}

const citedEntries = [...new Set(CORPUS.evidence.map((e) => e.entry))];

export const LLMS_SOURCE: LlmsSource = {
  corpus: CORPUS,
  siteUrl: SITE_URL,
  mcpUrl: MCP_URL,
  fullUrl: `${SITE_URL}/llms-full.txt`,
  // The same file contact-section.tsx offers as "Résumé (PDF)", made absolute:
  // an llms.txt is read out of context, so relative links resolve to nothing.
  resumeUrl: `${SITE_URL}/KalebK_Resume.pdf`,
  anchors: { work: `${SITE_URL}/#work`, career: `${SITE_URL}/#career` },
  cards: WORK_PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    href: p.links[0]?.href ?? null,
    ...(p.linkNote ? { linkNote: p.linkNote } : {}),
  })),
  experience: Object.values(RESUME_DATA)
    .filter((e) => e.type === 'work')
    .map((e) => toEntry(e.fileId)),
  entries: Object.fromEntries(citedEntries.map((id) => [id, toEntry(id)])),
};
