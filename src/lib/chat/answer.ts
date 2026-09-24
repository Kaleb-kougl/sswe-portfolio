import { GAP_VOCABULARY, SKILL_CATEGORIES, SKILL_CATEGORY, SKILLS_TABLE, type SkillCategory } from '@/data/corpus/skills';
import type { Evidence, Profile } from '@/data/corpus';
import { SITE_URL } from '@/data/site';
import { analyzeWithoutModel } from '@/lib/fit/analyze';
import type { FitReport, Verdict } from '@/lib/fit/contract';
import { validateJd } from '@/lib/fit/prompt';
import { runTool, type Project } from '@/lib/tools';

import { NO_FIGURE_LINE, statesFigureOf } from './figures';
import {
  PROJECT_ALIASES,
  editDistance,
  routeChat,
  type AskedSkill,
  type ChatIntent,
  type Figures,
  type ProfileTopic,
  type UnstatedTopic,
} from './route';

/**
 * "ASK ABOUT MY WORK", WITHOUT A MODEL.
 *
 * The on-device chat spike (evals/chat/results/2026-09-24-summary.md) had a
 * small model narrate tool output, and it embellished in ways no checker
 * caught. This keeps the spike's router and tools and drops the narrator:
 * code picks a tool (`routeChat`), the tool runs, and every sentence of the
 * reply is a fixed template whose blanks are filled from that tool's output.
 * Evidence is quoted verbatim, never paraphrased. Nothing here can say a
 * skill, number or employer the tools didn't return, and
 * __tests__/chat/answer.test.ts holds every reply to the spike's
 * faithfulness checker with zero flags.
 *
 * Pure and synchronous: no model, no network, no storage. It runs in the
 * visitor's browser (src/components/fit/ask-results.tsx), so a question never
 * leaves the page.
 */

// ------------------------------------------------------------------ types

export interface EvidenceCard {
  id: string;
  /** The corpus claim, verbatim (first person: it is Kaleb's own wording). */
  claim: string;
  /** "Senior Software Engineer, Indeed.com" or "BonkBall": from list_projects. */
  where: string;
  period: string | null;
  metric: string | null;
  /**
   * `label` is the corpus's full source label ("Résumé: Software Engineer II,
   * Indeed.com"), kept as the link's accessible name; `short` is what the card
   * shows after the entry and dates ("Résumé", "GitHub", "npm", "Paper").
   */
  source: { label: string; short: string; href: string; external: boolean };
}

export type Finding =
  | {
      status: 'found';
      /** The skill's label, or null for a keyword search. */
      skill: string | null;
      lead: string;
      /** The first CARDS_SHOWN records, ranked: a stated metric first, then the most recent. */
      cards: EvidenceCard[];
      /** The rest, behind a "Show N more" disclosure. */
      more: EvidenceCard[];
    }
  | {
      status: 'none';
      skill: string | null;
      lead: string;
      /** Labels the related records as related, never as a match. */
      relatedLead: string | null;
      related: EvidenceCard[];
    };

export interface ProfileDetail {
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}

export interface ProjectItem {
  id: string;
  kind: 'role' | 'project';
  name: string;
  context: string | null;
  period: string | null;
  /** A question the visitor can send about it, when the router can answer one. */
  ask: string | null;
}

/** A pasted JD, summarised in the thread; the full report opens in the checker above. */
export interface FitSummary {
  role: string;
  /** The coverage line, or the no-coverage line: the check_fit tool's own `coverage`. */
  coverage: string;
  /** Rows per verdict, counted from the tool's rows. */
  counts: Record<Verdict, number>;
  /** Up to three gaps by name, must-haves first. */
  gaps: string[];
}

export type ChatReply =
  | {
      kind: 'evidence';
      lead: string | null;
      findings: Finding[];
      /** "My records say: “…”": each shown record's own figure, for a leading question. */
      figures: string[];
      /** NO_FIGURE_LINE when the question's figure matched no record's; else null. */
      figureNote: string | null;
      announce: string;
    }
  | {
      kind: 'fit';
      lead: string;
      summary: FitSummary;
      report: FitReport;
      /** The validated JD, handed to the checker above by "Open the full report". Never sent anywhere. */
      jd: string;
      announce: string;
    }
  | { kind: 'profile'; topic: ProfileTopic; lead: string; details: ProfileDetail[]; announce: string }
  | {
      kind: 'project';
      name: string;
      meta: string;
      summary: string;
      links: { label: string; href: string; external: boolean }[];
      linkNote: string | null;
      cards: EvidenceCard[];
      more: EvidenceCard[];
      announce: string;
    }
  | { kind: 'projects'; lead: string; items: ProjectItem[]; announce: string }
  | { kind: 'help'; lead: string; note: string | null; examples: string[]; announce: string }
  | { kind: 'unknown-skill'; lead: string; suggestions: string[]; announce: string };

export type ChatReplyKind = ChatReply['kind'];

/** One tool call behind a reply, for the faithfulness test. */
export interface ToolCall {
  tool: string;
  output: unknown;
}

// ------------------------------------------------------------------ templates

/** Cards shown per skill before "Show N more". */
export const CARDS_SHOWN = 2;

/*
 * VOICE. The page is Kaleb's ("Ask about my work"), so every reply speaks as
 * him: "my work", "I'm based in". The corpus claims are his own first-person
 * wording already. (The MCP tools keep speaking ABOUT Kaleb, to other agents;
 * only these templates are first person.)
 */

export const HELP_LEAD =
  'This answers from my evidence records with plain code, no AI model: whether I have used a skill, what a project or role involved, how to reach me and whether I’m available, or how I fit a job description you paste in.';

export const INJECTION_NOTE =
  'Instructions in a message don’t change anything here. There is no model to follow them, only code that looks things up.';

export const EXAMPLE_QUESTIONS: readonly string[] = [
  'Have you used React?',
  'Kubernetes?',
  'React and Go?',
  'Tell me about r3f-projectiles',
  'How do I contact you?',
  'Are you available?',
];

export const UNKNOWN_SKILL_LEAD = 'That isn’t in the skills I can check. Try one of these, or paste the job description.';

export const LEADING_LEAD =
  'Your question states something as fact. This doesn’t confirm or deny it. Here is what my records say, in their own words.';

const QUERY_LEAD = 'No skill named, so these are my closest records by keyword. A text match, not a verdict.';
const QUERY_NONE = 'None of my records match that question. Try naming a skill, or ask about a project.';
const FIGURE_LEAD = 'The records that state a number of that kind:';

const FIT_LEAD = 'That looks like a job description. Here is how it reads against my work, checked on this page.';

const UNSTATED_TEXT: Readonly<Record<UnstatedTopic, string>> = {
  relocation: 'My profile doesn’t say whether I would relocate. Ask me directly:',
  remote: 'My profile doesn’t say whether I want remote, hybrid or on-site work. Ask me directly:',
  visa: 'My profile doesn’t cover work authorization. Ask me directly:',
  salary: 'My profile doesn’t state pay expectations. Ask me directly:',
  phone: 'There is no phone number here on purpose. Email or the contact form reach me:',
};

const found = (total: number) => `Yes — ${total} ${total === 1 ? 'record' : 'records'}:`;
const foundLeading = (label: string, total: number) => `${total} ${total === 1 ? 'record mentions' : 'records mention'} ${label}:`;
const noEvidence = (label: string) => `No evidence of ${label} in my work.`;
const relatedLead = (label: string, category: string) => `Related, not ${label} evidence: my closest ${category} work.`;
const figureLine = (metric: string) => `My records say: “${metric}.”`;

// ------------------------------------------------------------------ tool calls

interface SearchOutput {
  interpretedAs: { skills: string[]; unknownSkills: string[]; keywords: string[] };
  total: number;
  results: (Evidence & { score: number; matchedSkills: string[] })[];
}

interface CheckFitOutput {
  role: string;
  coverage: string;
  requirements: { text: string; priority: string; verdict: string; note: string; evidence: { id: string }[] }[];
}

class Calls {
  readonly log: ToolCall[] = [];
  private projects: readonly Project[] | null = null;

  run<T>(tool: string, input: unknown): T {
    const output = runTool(tool, input) as T;
    this.log.push({ tool, output });
    return output;
  }

  /** list_projects, once per reply: where each record comes from. */
  projectList(): readonly Project[] {
    this.projects ??= this.run<{ projects: Project[] }>('list_projects', {}).projects;
    return this.projects;
  }
}

// ------------------------------------------------------------------ cards

/** This site's own anchors render relative, like the fit report's chips. */
export function localHref(href: string): { href: string; external: boolean } {
  if (href.startsWith(`${SITE_URL}/`)) return { href: href.slice(SITE_URL.length), external: false };
  return { href, external: true };
}

function where(project: Project | undefined, entry: string): string {
  if (!project) return entry;
  return project.kind === 'role' && project.context ? `${project.name}, ${project.context}` : project.name;
}

/** The source's kind, short enough to sit after the entry and dates on one line. */
export function shortSourceLabel(label: string, href: string): string {
  if (/^r[ée]sum[ée](?![a-z])/i.test(label)) return 'Résumé';
  if (/^work\b/i.test(label)) return 'Work card';
  if (/^https?:\/\/(?:[\w-]+\.)*github\.com\//.test(href)) return 'GitHub';
  if (/^https?:\/\/(?:[\w-]+\.)*npmjs\.com\//.test(href)) return 'npm';
  if (/^https:\/\/doi\.org\//.test(href)) return 'Paper';
  if (/^https?:\/\/(?:[\w-]+\.)*roblox\.com\//.test(href)) return 'Roblox';
  return 'Source';
}

function card(e: Evidence, calls: Calls): EvidenceCard {
  const project = calls.projectList().find((p) => p.id === e.entry);
  return {
    id: e.id,
    claim: e.claim,
    where: where(project, e.entry),
    period: e.period ?? project?.period ?? null,
    metric: e.metric ?? null,
    source: { label: e.source.label, short: shortSourceLabel(e.source.label, e.source.href), ...localHref(e.source.href) },
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A period's end as a sortable number ("Aug 2022 – Dec 2024" → 2024.11); undated is -1. */
export function periodEnd(period: string | null): number {
  if (!period) return -1;
  const end = period.split(/[–—-]/).at(-1)!.trim().toLowerCase();
  if (/present|now|current/.test(end)) return 9999;
  const year = /(\d{4})/.exec(end);
  if (!year) return -1;
  const month = MONTHS.findIndex((m) => end.startsWith(m));
  return Number(year[1]) + (month >= 0 ? month : 11) / 100;
}

/** Records with a stated metric first, then the most recent; ties keep the tool's order. */
export function rankCards(cards: readonly EvidenceCard[]): EvidenceCard[] {
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(!!b.c.metric) - Number(!!a.c.metric) || periodEnd(b.c.period) - periodEnd(a.c.period) || a.i - b.i)
    .map(({ c }) => c);
}

function split(cards: EvidenceCard[]): { cards: EvidenceCard[]; more: EvidenceCard[] } {
  return { cards: cards.slice(0, CARDS_SHOWN), more: cards.slice(CARDS_SHOWN) };
}

// ------------------------------------------------------------------ evidence

const CANONICAL = new Set(SKILLS_TABLE.map((s) => s.id));
const GAP_CATEGORY = new Map(GAP_VOCABULARY.map((g) => [g.id, g.category]));

function categoryOf(skill: AskedSkill): SkillCategory | undefined {
  return skill.gap ? GAP_CATEGORY.get(skill.id) : SKILL_CATEGORY[skill.id];
}

/** The closest records in the same domain of work, for a skill with none. */
function related(skill: AskedSkill, calls: Calls): { lead: string | null; cards: EvidenceCard[] } {
  const category = categoryOf(skill);
  if (!category) return { lead: null, cards: [] };
  const inCategory = [...CANONICAL].filter((id) => SKILL_CATEGORY[id] === category && id !== skill.id);
  if (inCategory.length === 0) return { lead: null, cards: [] };
  const out = calls.run<SearchOutput>('search_evidence', { skills: inCategory, limit: 2 });
  if (out.results.length === 0) return { lead: null, cards: [] };
  return { lead: relatedLead(skill.label, SKILL_CATEGORIES[category]), cards: out.results.map((e) => card(e, calls)) };
}

function skillFinding(skill: AskedSkill, leading: boolean, calls: Calls): Finding {
  // Gap terms go in by label: the tool reports them under unknownSkills.
  const out = calls.run<SearchOutput>('search_evidence', { skills: [skill.gap ? skill.label : skill.id], limit: 50 });
  if (out.total === 0) {
    const rel = related(skill, calls);
    return { status: 'none', skill: skill.label, lead: noEvidence(skill.label), relatedLead: rel.lead, related: rel.cards };
  }
  const cards = rankCards(out.results.map((e) => card(e, calls)));
  return {
    status: 'found',
    skill: skill.label,
    lead: leading ? foundLeading(skill.label, out.total) : found(out.total),
    ...split(cards),
  };
}

/**
 * Records by keyword. When the question carries a figure, only records that
 * state a figure of the same family stay ("team of 10" keeps "led a team of
 * 6 engineers", drops "5 teams" and "~12 engineers mentored"); if none do,
 * the finding is null and the reply says NO_FIGURE_LINE instead.
 */
function queryFinding(query: string, figures: Figures, calls: Calls): Finding | null {
  if (figures) {
    const out = calls.run<SearchOutput>('search_evidence', { query, limit: 50 });
    const matching = out.results.filter((e) => statesFigureOf(e, figures));
    if (matching.length === 0) return null;
    return { status: 'found', skill: null, lead: FIGURE_LEAD, ...split(rankCards(matching.map((e) => card(e, calls)))) };
  }
  const out = calls.run<SearchOutput>('search_evidence', { query, limit: 4 });
  if (out.results.length === 0) return { status: 'none', skill: null, lead: QUERY_NONE, relatedLead: null, related: [] };
  return { status: 'found', skill: null, lead: QUERY_LEAD, ...split(out.results.map((e) => card(e, calls))) };
}

/**
 * "My records say X": each found record's own figure, verbatim. With a figure
 * in the question, only figures of the same family.
 */
function figureLines(findings: readonly Finding[], figures: Figures): string[] {
  const cards = findings.flatMap((f) => (f.status === 'found' ? [...f.cards, ...f.more] : []));
  const metrics = cards.filter((c) => c.metric && (!figures || statesFigureOf({ claim: '', metric: c.metric }, figures))).map((c) => c.metric!);
  return [...new Set(metrics)].map(figureLine);
}

function evidenceReply(findings: Finding[], leading: boolean, figures: Figures = null): ChatReply {
  const lines = leading ? figureLines(findings, figures) : [];
  const figureNote = leading && figures && lines.length === 0 ? NO_FIGURE_LINE : null;
  const announce = [
    ...(figureNote ? [figureNote] : []),
    ...findings.map((f) => {
      if (f.skill === null) return f.status === 'found' ? (figures ? 'Records that state a number of that kind.' : 'Closest records by keyword.') : 'No records match.';
      return f.status === 'found' ? `${f.skill}: ${f.lead.replace(/:$/, '.')}` : f.lead;
    }),
  ].join(' ');
  return {
    kind: 'evidence',
    lead: leading ? LEADING_LEAD : null,
    findings,
    figures: lines,
    figureNote,
    announce,
  };
}

// ------------------------------------------------------------------ profile

function profileReply(topic: ProfileTopic, unstated: UnstatedTopic | null, calls: Calls): ChatReply {
  const p = calls.run<Profile>('get_profile', {});
  const form = localHref(p.links.contactForm);
  const contact: ProfileDetail[] = [
    { label: 'Email', value: p.email, href: `mailto:${p.email}`, external: false },
    { label: 'Contact form', value: 'Send a message', href: form.href, external: form.external },
    { label: 'LinkedIn', value: p.links.linkedin.replace(/^https:\/\//, ''), href: p.links.linkedin, external: true },
    { label: 'GitHub', value: p.links.github.replace(/^https:\/\//, ''), href: p.links.github, external: true },
  ];
  const availability: ProfileDetail = { label: 'Availability', value: p.availability ?? 'Not stated' };
  const location: ProfileDetail = { label: 'Based in', value: p.location };
  const roles: ProfileDetail = { label: 'Looking for', value: p.roleTargets.join('; ') || 'Not stated' };
  const title: ProfileDetail = { label: 'Current title', value: p.title };

  let lead: string;
  let details: ProfileDetail[];
  switch (topic) {
    case 'contact':
      lead = `Email me at ${p.email}, or use the contact form.`;
      details = contact;
      break;
    case 'availability':
      lead = p.availability ? `I’m ${lowerFirst(p.availability)}.` : 'My profile doesn’t state my availability.';
      details = [availability, roles, ...contact.slice(0, 2)];
      break;
    case 'location':
      lead = `I’m based in ${p.location}.`;
      details = [location, availability, ...contact.slice(0, 2)];
      break;
    case 'roles':
      lead = p.roleTargets.length ? `I’m targeting these roles: ${p.roleTargets.join('; ')}.` : 'My profile doesn’t list target roles.';
      details = [roles, availability, ...contact.slice(0, 2)];
      break;
    case 'about':
      lead = `I’m ${p.name}, ${p.title}. From my profile: “${p.summary}”`;
      details = [title, location, availability, roles, ...contact];
      break;
    case 'unstated':
      lead = UNSTATED_TEXT[unstated ?? 'relocation'];
      details = [...contact.slice(0, 2), location, availability];
      break;
  }
  return { kind: 'profile', topic, lead, details, announce: lead };
}

/** "Available now (as of …)" → "available now (as of …)", after "I’m". */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

// ------------------------------------------------------------------ projects

function projectReply(id: string, calls: Calls): ChatReply {
  const p = calls.run<Project & { evidence: Evidence[] }>('get_project', { id });
  const meta = [p.kind === 'role' ? 'Role' : 'Project', p.context, p.period].filter(Boolean).join(' · ');
  const cards = rankCards(p.evidence.map((e) => card(e, calls)));
  return {
    kind: 'project',
    name: p.name,
    meta,
    summary: p.summary,
    links: p.links.map((l) => ({ label: l.label, ...localHref(l.href) })),
    linkNote: p.linkNote ?? null,
    ...split(cards),
    announce: `${p.name}. ${meta}.`,
  };
}

const ASK_NAME_MAX = 32;

function projectsReply(calls: Calls): ChatReply {
  const items: ProjectItem[] = calls.projectList().map((p) => {
    // Roles share titles ("Software Engineer II" at Indeed and IBM), so only
    // projects get a question the router can answer by name.
    const name = p.name.length <= ASK_NAME_MAX ? p.name : PROJECT_ALIASES.find((a) => a.id === p.id)?.names[0];
    return {
      id: p.id,
      kind: p.kind,
      name: p.name,
      context: p.context,
      period: p.period,
      ask: p.kind === 'project' && name ? `Tell me about ${name}` : null,
    };
  });
  const lead = 'My roles and projects, each backed by evidence records:';
  return { kind: 'projects', lead, items, announce: lead };
}

// ------------------------------------------------------------------ fit

const GAPS_SHOWN = 3;

/** A gap row's name: the skill it names, else its own (clipped) text. */
function gapName(row: FitReport['requirements'][number]): string {
  const skill = row.otherSkills[0] ?? (row.skills[0] ? SKILLS_TABLE.find((s) => s.id === row.skills[0])?.label : undefined);
  if (skill) return skill;
  return row.text.length <= 48 ? row.text : `${row.text.slice(0, 47).trimEnd()}…`;
}

function fitReply(jd: string, calls: Calls): ChatReply {
  const check = validateJd(jd);
  if (!check.ok) return helpReply(check.message, null);
  // The check_fit tool runs `analyzeWithoutModel` on the same text. The
  // summary is counted from the tool's rows; the gap names need the rows'
  // skill tags, which only the FitReport carries, so both run.
  const out = calls.run<CheckFitOutput>('check_fit', { job_description: check.jd });
  const report = analyzeWithoutModel(check.jd);
  const counts: Record<Verdict, number> = { strong: 0, partial: 0, gap: 0, not_assessed: 0 };
  for (const r of out.requirements) counts[r.verdict as Verdict]++;
  const gapRows = report.requirements.filter((r) => r.verdict === 'gap');
  const ordered = [...gapRows.filter((r) => r.priority === 'must'), ...gapRows.filter((r) => r.priority !== 'must')];
  const gaps = [...new Set(ordered.map(gapName))].slice(0, GAPS_SHOWN);
  return {
    kind: 'fit',
    lead: FIT_LEAD,
    summary: { role: out.role, coverage: out.coverage, counts, gaps },
    report,
    jd: check.jd,
    announce: `Fit check ready. ${out.coverage}.`.replace(/\.\.$/, '.'),
  };
}

/** "3 strong · 2 partial · 4 gaps · 1 not assessed": the counts as the summary card words them. */
export function countLine(counts: Record<Verdict, number>): string {
  return [
    `${counts.strong} strong`,
    `${counts.partial} partial`,
    `${counts.gap} ${counts.gap === 1 ? 'gap' : 'gaps'}`,
    `${counts.not_assessed} not assessed`,
  ].join(' · ');
}

/** The gaps line: an absence, worded as one. */
export function gapsLine(gaps: readonly string[]): string | null {
  return gaps.length ? `No evidence in my work for: ${gaps.join(', ')}.` : null;
}

// ------------------------------------------------------------------ help, unknown

function helpReply(lead: string = HELP_LEAD, note: string | null = null): ChatReply {
  return { kind: 'help', lead, note, examples: [...EXAMPLE_QUESTIONS], announce: note ? `${note} ${lead}` : lead };
}

const DEFAULT_SUGGESTIONS = ['TypeScript', 'React', 'Python', 'GraphQL'];

/** Canonical skills with evidence whose names are closest to the term. */
function suggestionsFor(term: string): string[] {
  const t = term.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const near = SKILLS_TABLE.map((s) => ({ label: s.label, d: editDistance(t, s.label.toLowerCase().replace(/[^a-z0-9]+/g, '')) }))
    .filter((s) => s.d <= Math.max(2, Math.floor(t.length / 3)))
    .sort((a, b) => a.d - b.d)
    .map((s) => s.label);
  return [...new Set([...near, ...DEFAULT_SUGGESTIONS])].slice(0, 4).map((label) => `Have you used ${label}?`);
}

function unknownReply(term: string, leading: boolean, figures: Figures, calls: Calls): ChatReply {
  // A single word the vocabulary doesn't know may still be a keyword the
  // records use ("teams"). More than one word ("Next.js" → "next", "js")
  // would match fragments, so it is simply unknown.
  if (/^[A-Za-z]+$/.test(term)) {
    const finding = queryFinding(term, figures, calls);
    if (finding?.status === 'found') return evidenceReply([finding], leading, figures);
  }
  return { kind: 'unknown-skill', lead: UNKNOWN_SKILL_LEAD, suggestions: suggestionsFor(term), announce: UNKNOWN_SKILL_LEAD };
}

// ------------------------------------------------------------------ answer

export function answerIntent(intent: ChatIntent): { reply: ChatReply; calls: ToolCall[] } {
  const calls = new Calls();
  const reply = build(intent, calls);
  return { reply, calls: calls.log };
}

function build(intent: ChatIntent, calls: Calls): ChatReply {
  switch (intent.kind) {
    case 'help':
      return helpReply(HELP_LEAD, intent.reason === 'injection' ? INJECTION_NOTE : null);
    case 'fit':
      return fitReply(intent.jd, calls);
    case 'projects':
      return projectsReply(calls);
    case 'project':
      return projectReply(intent.id, calls);
    case 'profile':
      return profileReply(intent.topic, intent.unstated, calls);
    case 'skills':
      return evidenceReply(
        intent.asked.map((s) => skillFinding(s, intent.leading, calls)),
        intent.leading,
        intent.figures,
      );
    case 'query': {
      const finding = queryFinding(intent.query, intent.leading ? intent.figures : null, calls);
      return evidenceReply(finding ? [finding] : [], intent.leading, intent.figures);
    }
    case 'unknown-term':
      return unknownReply(intent.term, intent.leading, intent.leading ? intent.figures : null, calls);
  }
}

/** The reply and the tool calls behind it. */
export function answerWithCalls(message: string): { reply: ChatReply; calls: ToolCall[]; intent: ChatIntent } {
  const intent = routeChat(message);
  return { ...answerIntent(intent), intent };
}

/** A visitor's message → the reply to render. Pure: no model, no network. */
export function answer(message: string): ChatReply {
  return answerWithCalls(message).reply;
}

// ------------------------------------------------------------------ text

/**
 * Every statement a reply makes, as plain text: what the faithfulness test
 * checks. Left out, because they state nothing about Kaleb: field captions
 * ("Email", "LinkedIn"), and suggestion and example chips (questions the
 * visitor can send). A card's short source label and its full one (the
 * link's accessible name) are both included. A pasted JD's summary card
 * says its coverage line, verdict counts and gap names; the full report's
 * rows are the checker's, above.
 */
export function replyText(reply: ChatReply): string {
  const cardText = (c: EvidenceCard) => [c.claim, c.where, c.period, c.metric, c.source.short, c.source.label].filter(Boolean).join('. ');
  switch (reply.kind) {
    case 'evidence':
      return [
        reply.lead,
        ...reply.figures,
        reply.figureNote,
        ...reply.findings.flatMap((f) =>
          f.status === 'found'
            ? [f.skill, f.lead, ...[...f.cards, ...f.more].map(cardText)]
            : [f.lead, f.relatedLead, ...f.related.map(cardText)],
        ),
        reply.announce,
      ]
        .filter(Boolean)
        .join('\n');
    case 'fit':
      // What the summary card shows. The row notes live in the full report,
      // which the checker above renders (and fit's own tests cover).
      return [
        reply.lead,
        reply.summary.coverage,
        `${countLine(reply.summary.counts)}.`,
        gapsLine(reply.summary.gaps),
        reply.announce,
      ]
        .filter(Boolean)
        .join('\n');
    case 'profile':
      return [reply.lead, ...reply.details.map((d) => d.value)].join('\n');
    case 'project':
      return [reply.name, reply.meta, reply.summary, ...reply.links.map((l) => l.label), reply.linkNote, ...[...reply.cards, ...reply.more].map(cardText)]
        .filter(Boolean)
        .join('\n');
    case 'projects':
      return [reply.lead, ...reply.items.map((i) => [i.name, i.context, i.period].filter(Boolean).join(', '))].join('\n');
    case 'help':
      return [reply.note, reply.lead].filter(Boolean).join('\n');
    case 'unknown-skill':
      return reply.lead;
  }
}
