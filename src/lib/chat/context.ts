import { CORPUS, type Evidence, type Profile } from '@/data/corpus';
import { GAP_VOCABULARY, SKILLS_TABLE } from '@/data/corpus/skills';
import type { Verdict } from '@/lib/fit/contract';
import { entryLabel, evidenceLabel } from '@/lib/fit/labels';
import { detectSkills } from '@/lib/fit/scan';
import { PROJECTS, type Project } from '@/lib/tools';

import type { AskedSkill, ChatRoute, ChatToolName } from './route';

/**
 * TOOL_OUTPUT AS THE MODEL SEES IT, plus the facts the faithfulness checker
 * needs. The tools return JSON meant for a large model (links, ids, method
 * notes); a 0.5–3B model gets a few short lines instead, and every line is
 * something the answer may repeat. Claims are turned into the third person
 * ("I led" → "Kaleb led"), since the bot speaks about Kaleb, not as him.
 *
 * The checker compares answers with `text` (what the model saw), not with
 * the full tool output: anything the model says that isn't in `text` it
 * made up, even if it happens to be true.
 */

export interface ContextRow {
  requirement: string;
  priority: 'must' | 'nice';
  verdict: Verdict;
  /** Short evidence labels, as shown. */
  evidence: string[];
  /** Skills (canonical or gap ids) the requirement names. */
  skills: string[];
}

export interface ChatContext {
  tool: ChatToolName;
  /** TOOL_OUTPUT, verbatim as it goes in the prompt. */
  text: string;
  /** What the user turn calls the question. For a JD, a fixed line (the JD itself isn't sent). */
  question: string;
  facts: {
    /** Canonical tags on the evidence shown, plus skills the text names. */
    supportedSkills: string[];
    /** Skills or requirements' skills with no evidence (gap vocabulary, zero results, gap rows). */
    unsupportedSkills: string[];
    /** check_fit rows (empty for other tools). */
    rows: ContextRow[];
    /** Any evidence record or strong/partial row at all. */
    hasEvidence: boolean;
    /** check_fit: every must-have row strong (the only case "strong fit" may be said). */
    allMustStrong: boolean;
  };
}

export const MAX_EVIDENCE = 4;
export const MAX_ROWS = 16;
const ROW_CHARS = 110;

const LABELS = new Map<string, string>([
  ...SKILLS_TABLE.map((s) => [s.id, s.label] as const),
  ...GAP_VOCABULARY.map((t) => [t.id, t.label] as const),
]);
const BY_ID = new Map(CORPUS.evidence.map((e) => [e.id, e]));

/** "I led my team" → "Kaleb led his team"; later "I" → "he". */
export function thirdPerson(claim: string): string {
  let named = false;
  return claim
    .replace(/\bI(?:’|')ve\b/g, () => (named ? 'he has' : ((named = true), 'Kaleb has')))
    .replace(/\bI\b/g, () => (named ? 'he' : ((named = true), 'Kaleb')))
    .replace(/\bmy\b/g, 'his')
    .replace(/\bMy\b/g, 'His')
    .replace(/\bme\b/g, 'him');
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}

function source(e: Evidence): string {
  const project = PROJECTS.find((p) => p.id === e.entry);
  if (!project) return entryLabel(e.entry);
  const where = project.kind === 'role' ? `${project.context}, ${project.name}` : project.name;
  return e.period ? `${where}, ${e.period}` : where;
}

function evidenceLines(records: readonly Evidence[]): string[] {
  return records.map((e, i) => `${i + 1}. ${thirdPerson(e.claim)} (${source(e)})`);
}

const skillIds = (text: string) => detectSkills(text).map((s) => s.id);
const unique = <T,>(xs: readonly T[]) => [...new Set(xs)];

function recordsWithTag(tag: string): number {
  return CORPUS.evidence.filter((e) => e.skills.includes(tag)).length;
}

// ------------------------------------------------------------ search_evidence

interface SearchOutput {
  results: (Evidence & { score: number })[];
  total: number;
}

function searchContext(output: SearchOutput, asked: readonly AskedSkill[], message: string): ChatContext {
  const shown = output.results.slice(0, MAX_EVIDENCE);
  const lines = ['TOOL: search_evidence'];
  const unsupported: string[] = [];
  if (asked.length) {
    lines.push('ASKED ABOUT:');
    for (const s of asked) {
      const n = s.gap ? 0 : recordsWithTag(s.id);
      if (n === 0) unsupported.push(s.id);
      lines.push(n === 0 ? `- ${s.label}: NO EVIDENCE in Kaleb's portfolio.` : `- ${s.label}: ${n} evidence record${n === 1 ? '' : 's'}.`);
    }
  }
  if (shown.length) {
    lines.push('EVIDENCE:', ...evidenceLines(shown));
  } else {
    lines.push("EVIDENCE: none. Kaleb's portfolio has no evidence matching this question.");
  }
  const text = lines.join('\n');
  const supported = unique([...shown.flatMap((e) => e.skills), ...skillIds(evidenceLines(shown).join('\n'))]).filter(
    (s) => !unsupported.includes(s),
  );
  return {
    tool: 'search_evidence',
    text,
    question: message,
    facts: { supportedSkills: supported, unsupportedSkills: unsupported, rows: [], hasEvidence: shown.length > 0, allMustStrong: false },
  };
}

// ------------------------------------------------------------ check_fit

interface CheckFitOutput {
  role: string;
  coverage: string;
  requirements: {
    text: string;
    priority: 'must' | 'nice';
    verdict: Verdict;
    evidence: { id: string }[];
    note: string;
  }[];
}

/**
 * A years-only row ("5+ years of software engineering") is judged on career
 * length, which the tool states in its note, not in evidence records:
 * "8 years in software since 2018, including an internship (2026 − 2018),
 * meets the 5 asked." (or "Years: …" after an evidence note).
 */
function yearsFact(note: string): string | null {
  const m = /(?:^|Years: )(\d+ years? in software[^(;]*?)\s*(?:\(|,? not per skill|;|$)/.exec(note);
  return m ? `career length: ${m[1].trim().replace(/,$/, '')}` : null;
}

const VERDICT_WORDS: Record<Verdict, string> = {
  strong: 'strong',
  partial: 'partial',
  gap: 'gap',
  not_assessed: 'not assessed',
};

function fitContext(output: CheckFitOutput): ChatContext {
  const rows: ContextRow[] = output.requirements.slice(0, MAX_ROWS).map((r) => {
    const requirement = clip(r.text, ROW_CHARS);
    return {
      requirement,
      priority: r.priority,
      verdict: r.verdict,
      evidence: [
        ...r.evidence.flatMap(({ id }) => {
          const e = BY_ID.get(id);
          return e ? [`${evidenceLabel(e)} (${entryLabel(e.entry)})`] : [];
        }),
        ...(r.evidence.length === 0 && (r.verdict === 'strong' || r.verdict === 'partial') && yearsFact(r.note) ? [yearsFact(r.note)!] : []),
      ],
      skills: skillIds(requirement),
    };
  });
  const more = output.requirements.length - rows.length;
  // The tool's own "no coverage" line is first person ("my portfolio").
  const coverage = /covered/.test(output.coverage) ? output.coverage : 'no coverage score (must-haves could not be identified)';
  const lines = [
    'TOOL: check_fit',
    `ROLE: ${clip(output.role, 100)}`,
    `COVERAGE: ${coverage}`,
    'REQUIREMENTS (priority | verdict | requirement | evidence). strong = clear evidence; partial = some evidence; gap = no evidence; not assessed = outside what the portfolio can show:',
    ...rows.map(
      (r) =>
        `- ${r.priority} | ${VERDICT_WORDS[r.verdict]} | ${r.requirement} | ${r.evidence.length ? r.evidence.join('; ') : 'no evidence'}`,
    ),
    ...(more > 0 ? [`(${more} more requirement${more === 1 ? '' : 's'} not shown)`] : []),
  ];
  const withEvidence = rows.filter((r) => r.verdict === 'strong' || r.verdict === 'partial');
  const evidenceTags = output.requirements
    .slice(0, MAX_ROWS)
    .flatMap((r) => r.evidence.flatMap(({ id }) => BY_ID.get(id)?.skills ?? []));
  const supported = unique([...withEvidence.flatMap((r) => r.skills), ...evidenceTags]);
  const unsupported = unique(
    rows.filter((r) => r.verdict === 'gap' || r.verdict === 'not_assessed').flatMap((r) => r.skills),
  ).filter((s) => !supported.includes(s));
  const musts = rows.filter((r) => r.priority === 'must');
  return {
    tool: 'check_fit',
    text: lines.join('\n'),
    question: "The visitor pasted a job description. Summarize how Kaleb's work matches it.",
    facts: {
      supportedSkills: supported,
      unsupportedSkills: unsupported,
      rows,
      hasEvidence: withEvidence.length > 0,
      allMustStrong: musts.length > 0 && musts.every((r) => r.verdict === 'strong') && more === 0,
    },
  };
}

// ------------------------------------------------------------ profile / project

function profileContext(p: Profile, message: string): ChatContext {
  const lines = [
    'TOOL: get_profile',
    `NAME: ${p.name}`,
    `TITLE: ${p.title}`,
    `LOCATION: ${p.location}`,
    `AVAILABILITY: ${p.availability ?? 'not stated'}`,
    `TARGET ROLES: ${p.roleTargets.length ? p.roleTargets.join('; ') : 'not stated'}`,
    `CONTACT: email ${p.email}; contact form ${p.links.contactForm}`,
    `LINKS: LinkedIn ${p.links.linkedin}; GitHub ${p.links.github}`,
    `SUMMARY: ${thirdPerson(p.summary)}`,
  ];
  const text = lines.join('\n');
  return {
    tool: 'get_profile',
    text,
    question: message,
    facts: { supportedSkills: skillIds(text), unsupportedSkills: [], rows: [], hasEvidence: true, allMustStrong: false },
  };
}

function projectContext(p: Project & { evidence: Evidence[] }, message: string): ChatContext {
  const shown = p.evidence.slice(0, 6);
  const lines = [
    'TOOL: get_project',
    `${p.kind === 'role' ? 'ROLE' : 'PROJECT'}: ${p.name}${p.context ? ` (${p.context})` : ''}`,
    ...(p.period ? [`PERIOD: ${p.period}`] : []),
    `SUMMARY: ${thirdPerson(clip(p.summary, 320))}`,
    'EVIDENCE:',
    ...evidenceLines(shown),
  ];
  const text = lines.join('\n');
  return {
    tool: 'get_project',
    text,
    question: message,
    facts: {
      supportedSkills: unique([...shown.flatMap((e) => e.skills), ...skillIds(text)]),
      unsupportedSkills: [],
      rows: [],
      hasEvidence: shown.length > 0,
      allMustStrong: false,
    },
  };
}

// ------------------------------------------------------------ entry

/** Turns a tool's JSON output into the model's TOOL_OUTPUT and the checker's facts. */
export function buildContext(route: Exclude<ChatRoute, { tool: 'none' }>, output: unknown, message: string): ChatContext {
  switch (route.tool) {
    case 'search_evidence':
      return searchContext(output as SearchOutput, route.asked, message);
    case 'check_fit':
      return fitContext(output as CheckFitOutput);
    case 'get_profile':
      return profileContext(output as Profile, message);
    case 'get_project':
      return projectContext(output as Project & { evidence: Evidence[] }, message);
  }
}

/** Label for an id the context uses (canonical skill or gap term). */
export function skillLabel(id: string): string {
  return LABELS.get(id) ?? id;
}
