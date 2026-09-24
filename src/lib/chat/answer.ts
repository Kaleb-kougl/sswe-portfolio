import { GAP_VOCABULARY, SKILL_CATEGORIES, SKILL_CATEGORY, SKILLS_TABLE, type SkillCategory } from '@/data/corpus/skills';
import type { Evidence, Profile } from '@/data/corpus';
import { SITE_URL } from '@/data/site';
import { analyzeWithoutModel } from '@/lib/fit/analyze';
import type { FitReport } from '@/lib/fit/contract';
import { validateJd } from '@/lib/fit/prompt';
import { runTool, type Project } from '@/lib/tools';

import {
  PROJECT_ALIASES,
  editDistance,
  routeChat,
  type AskedSkill,
  type ChatIntent,
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
  source: { label: string; href: string; external: boolean };
}

export type Finding =
  | {
      status: 'found';
      /** The skill's label, or null for a keyword search. */
      skill: string | null;
      lead: string;
      cards: EvidenceCard[];
      /** Records past the first few, behind a disclosure. */
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

export type ChatReply =
  | { kind: 'evidence'; lead: string | null; findings: Finding[]; figures: string[]; announce: string }
  | { kind: 'fit'; lead: string; report: FitReport; announce: string }
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

/** Cards shown before "More records". */
export const CARDS_SHOWN = 3;

export const HELP_LEAD =
  'This answers from Kaleb’s evidence records with plain code, no AI model: whether he has used a skill, what a project or role involved, how to reach him and whether he’s available, or how he fits a job description you paste in.';

export const INJECTION_NOTE =
  'Instructions in a message don’t change anything here. There is no model to follow them, only code that looks things up.';

export const EXAMPLE_QUESTIONS: readonly string[] = [
  'Has he used React?',
  'Kubernetes?',
  'React and Go?',
  'Tell me about r3f-projectiles',
  'How do I contact him?',
  'Is he available?',
];

export const UNKNOWN_SKILL_LEAD = 'That isn’t in the skills I can check. Try one of these, or paste the job description.';

const LEADING_LEAD =
  'Your question states something as fact. This doesn’t confirm or deny it: here is what the records say, in their own words.';

const QUERY_LEAD = 'No skill named, so these are the closest records by keyword. A text match, not a verdict.';
const QUERY_NONE = 'No records match that question. Try naming a skill, or ask about a project.';

const FIT_LEAD = 'That looks like a job description, so here is the fit check, run on this page.';

const UNSTATED_TEXT: Readonly<Record<UnstatedTopic, string>> = {
  relocation: 'His profile doesn’t say whether he would relocate. Ask him directly:',
  remote: 'His profile doesn’t say whether he wants remote, hybrid or on-site work. Ask him directly:',
  visa: 'His profile doesn’t cover work authorization. Ask him directly:',
  salary: 'His profile doesn’t state pay expectations. Ask him directly:',
  phone: 'There is no phone number here on purpose. Email or the contact form reach him:',
};

const found = (total: number) => `Yes — ${total} ${total === 1 ? 'record' : 'records'}:`;
const foundLeading = (label: string, total: number) => `${total} ${total === 1 ? 'record mentions' : 'records mention'} ${label}:`;
const noEvidence = (label: string) => `No evidence of ${label} in Kaleb’s work.`;
const relatedLead = (label: string, category: string) =>
  `Related, not ${label} evidence: the closest ${category} work.`;

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

function card(e: Evidence, calls: Calls): EvidenceCard {
  const project = calls.projectList().find((p) => p.id === e.entry);
  return {
    id: e.id,
    claim: e.claim,
    where: where(project, e.entry),
    period: e.period ?? project?.period ?? null,
    metric: e.metric ?? null,
    source: { label: e.source.label, ...localHref(e.source.href) },
  };
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
  const cards = out.results.map((e) => card(e, calls));
  return {
    status: 'found',
    skill: skill.label,
    lead: leading ? foundLeading(skill.label, out.total) : found(out.total),
    ...split(cards),
  };
}

function queryFinding(query: string, calls: Calls): Finding {
  const out = calls.run<SearchOutput>('search_evidence', { query, limit: 4 });
  if (out.results.length === 0) return { status: 'none', skill: null, lead: QUERY_NONE, relatedLead: null, related: [] };
  return { status: 'found', skill: null, lead: QUERY_LEAD, cards: out.results.map((e) => card(e, calls)), more: [] };
}

/** "The evidence says X": each shown record's own figure, verbatim. */
function figuresOf(findings: readonly Finding[]): string[] {
  const metrics = findings.flatMap((f) => (f.status === 'found' ? [...f.cards, ...f.more] : [])).flatMap((c) => (c.metric ? [c.metric] : []));
  return [...new Set(metrics)].map((m) => `The evidence says: “${m}.”`);
}

function evidenceReply(findings: Finding[], leading: boolean): ChatReply {
  const announce = findings
    .map((f) => {
      if (f.skill === null) return f.status === 'found' ? 'Closest records by keyword.' : 'No records match.';
      return f.status === 'found' ? `${f.skill}: ${f.lead.replace(/:$/, '.')}` : f.lead;
    })
    .join(' ');
  return {
    kind: 'evidence',
    lead: leading ? LEADING_LEAD : null,
    findings,
    figures: leading ? figuresOf(findings) : [],
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
      lead = `Email ${p.email}, or use the contact form.`;
      details = contact;
      break;
    case 'availability':
      lead = p.availability ? `${p.availability}.` : 'His profile doesn’t state his availability.';
      details = [availability, roles, ...contact.slice(0, 2)];
      break;
    case 'location':
      lead = `Based in ${p.location}.`;
      details = [location, availability, ...contact.slice(0, 2)];
      break;
    case 'roles':
      lead = p.roleTargets.length ? `Looking for: ${p.roleTargets.join('; ')}.` : 'His profile doesn’t list target roles.';
      details = [roles, availability, ...contact.slice(0, 2)];
      break;
    case 'about':
      lead = `${p.name}, ${p.title}. From his profile: “${p.summary}”`;
      details = [title, location, availability, roles, ...contact];
      break;
    case 'unstated':
      lead = UNSTATED_TEXT[unstated ?? 'relocation'];
      details = [...contact.slice(0, 2), location, availability];
      break;
  }
  return { kind: 'profile', topic, lead, details, announce: lead };
}

// ------------------------------------------------------------------ projects

function projectReply(id: string, calls: Calls): ChatReply {
  const p = calls.run<Project & { evidence: Evidence[] }>('get_project', { id });
  const meta = [p.kind === 'role' ? 'Role' : 'Project', p.context, p.period].filter(Boolean).join(' · ');
  const cards = p.evidence.map((e) => card(e, calls));
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
  const lead = 'His roles and projects, each backed by evidence records:';
  return { kind: 'projects', lead, items, announce: lead };
}

// ------------------------------------------------------------------ fit

function fitReply(jd: string, calls: Calls): ChatReply {
  const check = validateJd(jd);
  if (!check.ok) return helpReply(check.message, null);
  // The check_fit tool runs `analyzeWithoutModel` on the same text; the
  // report view needs the FitReport shape it is built from, so both run.
  const out = calls.run<CheckFitOutput>('check_fit', { job_description: check.jd });
  const report = analyzeWithoutModel(check.jd);
  return { kind: 'fit', lead: FIT_LEAD, report, announce: `Fit check ready. ${out.coverage}.`.replace(/\.\.$/, '.') };
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
  return [...new Set([...near, ...DEFAULT_SUGGESTIONS])].slice(0, 4).map((label) => `Has he used ${label}?`);
}

function unknownReply(term: string, leading: boolean, calls: Calls): ChatReply {
  // A single word the vocabulary doesn't know may still be a keyword the
  // records use ("teams"). More than one word ("Next.js" → "next", "js")
  // would match fragments, so it is simply unknown.
  if (/^[A-Za-z]+$/.test(term)) {
    const finding = queryFinding(term, calls);
    if (finding.status === 'found') return evidenceReply([finding], leading);
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
      );
    case 'query':
      return evidenceReply([queryFinding(intent.query, calls)], intent.leading);
    case 'unknown-term':
      return unknownReply(intent.term, intent.leading, calls);
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
 * checks. Left out, because they state nothing about Kaleb: a fit row's
 * requirement text (the visitor's own posting, quoted back), field captions
 * ("Email", "LinkedIn"), and suggestion and example chips (questions the
 * visitor can send). The fit rows' notes are included.
 */
export function replyText(reply: ChatReply): string {
  const cardText = (c: EvidenceCard) => [c.claim, c.where, c.period, c.metric, c.source.label].filter(Boolean).join('. ');
  switch (reply.kind) {
    case 'evidence':
      return [
        reply.lead,
        ...reply.figures,
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
      return [reply.lead, reply.announce, ...reply.report.requirements.map((r) => r.note)].join('\n');
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
