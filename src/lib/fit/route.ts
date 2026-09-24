import { SKILLS_TABLE } from '@/data/corpus/skills';

import type { CanonicalSkillId, Segment, SegmentedJd } from './contract';
import { COMPANY_VOICE, isBlurb } from './merge';
import { SCAN_SHADOW_TERMS, SCAN_STOP_TERMS } from './scan';

/**
 * ROUTING FOR MODEL + CODE v2 (plan 2f): which segments code is unsure about,
 * and which skills code might have missed. Pure and synchronous, so it runs
 * in the worker, in tests and in the offline threshold sweep alike.
 *
 * v1 asked the model about every candidate in one long generation. v2 asks
 * short yes/no questions, and only where code is guessing:
 *
 * - `uncertainSegments`: the candidates whose keep/drop call is a guess
 *   (rules below). Only these get the "is this a requirement?" question.
 * - `proposeSkills`: canonical skills a segment probably names that the
 *   alias scan didn't find. The model is asked about each one, yes or no.
 *   It never picks skills itself, so it can't shift them to the wrong line.
 */

// --- Routing ------------------------------------------------------------------

export type RouteReason =
  /** Before any header, or under one code didn't recognise: no rule applies with confidence. */
  | 'unknown-section'
  /**
   * A requirements / preferred line with no skill (canonical or gap) and no
   * years. Code keeps it unless it's a blurb ("Excellent communication" and
   * "Bachelor's degree" are real; a stray sentence is not).
   */
  | 'bare-requirement'
  /**
   * A requirements / preferred line that reads like an intro or a duty:
   * company voice ("We're…", "Our…", "Join…"), "you'll / you will", a
   * lead-in or paragraph (`isBlurb`), or a long first sentence of its
   * section (a header's blurb rather than an item).
   */
  | 'intro-or-duty'
  /**
   * A responsibilities line that names a skill. Code keeps it as a
   * nice-to-have; whether a duty is really asking for the skill is the
   * ambiguous part.
   */
  | 'duty-names-skill';

/** "you'll", "you will" (straight or curly apostrophe). */
const YOU_WILL = /\byou(?:'|’)ll\b|\byou will\b/i;
/** A first line this long, ending like a sentence, reads as a blurb. */
const FIRST_LINE_WORDS = 12;

const namesSkill = (s: Segment) => s.skills.length + s.otherSkills.length > 0;

/**
 * Why a candidate is routed to the model, one reason per rule that applies
 * (in the order listed on `RouteReason`); empty when code is confident.
 * `first` says whether the segment opens its section.
 */
export function routeReasons(segment: Segment, first: boolean): RouteReason[] {
  const reasons: RouteReason[] = [];
  const text = segment.text.trim();
  switch (segment.section) {
    case 'unknown':
      reasons.push('unknown-section');
      break;
    case 'requirements':
    case 'preferred': {
      if (!namesSkill(segment) && segment.minYears === null) reasons.push('bare-requirement');
      const firstLineBlurb = first && /[.!]$/.test(text) && text.split(/\s+/).length >= FIRST_LINE_WORDS;
      if (COMPANY_VOICE.test(text) || YOU_WILL.test(text) || isBlurb(text) || firstLineBlurb) {
        reasons.push('intro-or-duty');
      }
      break;
    }
    case 'responsibilities':
      if (namesSkill(segment)) reasons.push('duty-names-skill');
      break;
    default:
      break;
  }
  return reasons;
}

/** Every candidate's routing reasons, keyed by segment index (candidates only). */
export function routeAll(seg: SegmentedJd): Map<number, RouteReason[]> {
  const out = new Map<number, RouteReason[]>();
  for (const index of seg.candidates) {
    const segment = seg.segments[index];
    const prev = seg.segments[index - 1];
    out.set(index, routeReasons(segment, !prev || prev.section !== segment.section));
  }
  return out;
}

/**
 * The candidates where code is guessing, as segment indices in document
 * order (a subset of `seg.candidates`). Everything else never reaches the
 * model's keep/drop question.
 */
export function uncertainSegments(seg: SegmentedJd): number[] {
  return [...routeAll(seg)].filter(([, reasons]) => reasons.length > 0).map(([index]) => index);
}

// --- Skill proposals ------------------------------------------------------------

/** At most this many proposals per segment, best first. */
export const MAX_PROPOSALS = 3;

/**
 * A term proposes its skill when MORE than this share of its stems' IDF
 * weight matched: "team" alone is exactly half of "team lead", so it
 * doesn't count; "APIs … design" is all of "API design"…
 */
export const MIN_TERM_SCORE = 0.5;
/** …and the matched weight is at least this (one distinctive word, or several common ones). */
export const MIN_MATCHED_WEIGHT = 0.5;
/** Stems so common in job descriptions that they count a quarter. */
const GENERIC_STEMS = new Set(['build', 'platform', 'softwar', 'applicat', 'tool', 'team', 'design', 'system', 'product', 'model', 'servic', 'data', 'web', 'develop', 'engin', 'time', 'manag']);

/**
 * Extra phrases per skill, for proposing only. The alias table is for search
 * and must mean exactly the skill; these only suggest "maybe", and the model
 * answers yes or no before anything is added. Written as general JD phrasing,
 * not copied from the fixtures. Matched as contiguous stemmed phrases.
 */
export const PROPOSAL_HINTS: Readonly<Partial<Record<CanonicalSkillId, readonly string[]>>> = {
  wcag: ['screen reader', 'assistive technology', 'aria', 'keyboard navigation', 'inclusive design', 'accessible'],
  'api-design': ['api', 'rest', 'restful', 'endpoint', 'openapi', 'sdk'],
  'full-stack': ['end to end', 'across the stack', 'frontend and backend', 'front end and back end'],
  mentoring: ['grow engineers', 'coach engineers', 'onboard engineers'],
  'tech-leadership': ['lead', 'technical direction', 'run a team', 'manage a team', 'design reviews', 'set direction'],
  'system-design': ['distributed systems', 'scalable systems', 'architect'],
  'codebase-migrations': ['migrate', 'legacy code', 'modernize'],
  'build-systems': ['build times', 'build pipeline', 'vite', 'rollup', 'esbuild', 'monorepo tooling'],
  'automated-testing': ['test', 'tdd', 'integration tests', 'end to end tests', 'e2e'],
  'ai-platform': ['ai capabilities', 'model gateway', 'llm gateway', 'ai services'],
  genai: ['llm', 'gpt', 'foundation models', 'prompt engineering', 'openai', 'anthropic'],
  'agentic-workflows': ['tool use', 'tool calling', 'multi step agents', 'autonomous agents'],
  'web-performance': ['page speed', 'load time', 'rendering performance', 'performance budgets'],
  'ci-cd': ['deployment pipeline', 'github actions', 'release pipeline', 'continuous deployment'],
  'cross-functional-collaboration': ['partner with product', 'partner with design', 'work with product', 'across teams'],
  'developer-productivity': ['developer tooling', 'internal tools', 'engineering velocity'],
  'design-systems': ['component library', 'ui kit'],
  'state-management': ['redux', 'zustand', 'mobx'],
  'output-validation': ['evals', 'evaluation', 'quality checks'],
};

const STOPWORDS = new Set(
  (
    'a an the and or of to in on for with by at as from our your you we us is are be will ll have has this that it its ' +
    'other experience strong knowledge ability skill proficiency familiarity deep solid good great excellent ' +
    'year yrs plus etc using use via including such like e g'
  ).split(' '),
);

/** Words whose stems the suffix rules would get wrong. */
const IRREGULAR: Readonly<Record<string, string>> = {
  led: 'lead',
  ran: 'run',
  built: 'build',
  tech: 'technic',
  technology: 'technolog',
  technologies: 'technolog',
  apis: 'api',
  vite: 'vite',
  vital: 'vital',
  vitals: 'vital',
};

/**
 * Suffixes, longest first within a family; the stem keeps at least 3
 * letters. "es" only after a sibilant ("processes"), otherwise "s" applies
 * ("services" → "service"). "s" never strips "ss", "us" or "is" ("process",
 * "status", "analysis").
 */
const SUFFIXES = ['ship', 'ness', 'ibility', 'ible', 'ing', 'ion', 'ment', 'ance', 'er', 'ies', 'ied', 'es', 'ed', 'ally', 'al', 's'];

function stripOnce(w: string): string | null {
  for (const s of SUFFIXES) {
    if (!w.endsWith(s) || w.length - s.length < 3) continue;
    if (s === 's' && /(?:ss|us|is)$/.test(w)) return null;
    if (s === 'es' && !/(?:ss|x|z|ch|sh)es$/.test(w)) continue;
    return s === 'ies' || s === 'ied' ? `${w.slice(0, -s.length)}y` : w.slice(0, -s.length);
  }
  return null;
}

/**
 * A light stemmer, enough to line up "mentored"/"mentoring"/"mentorship",
 * "migrate"/"migrations", "testing"/"tests", "led"/"lead",
 * "leadership"/"leader". Suffixes are stripped until none applies (at most
 * three), then a final "e". Not Porter: it only has to be consistent
 * between the vocabulary and JD text.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length <= 3) return w;
  for (let i = 0; i < 3; i++) {
    const next = stripOnce(w);
    if (next === null) break;
    w = next;
  }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return IRREGULAR[w] ?? w;
}

/** Word tokens, lower-cased: letters and digits, "+" and "#" kept ("c++"). */
export function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z0-9][a-z0-9+#]*(?:\.js)?/g) ?? []).filter((t) => t.length >= 2);
}

/** Content stems of a text: stopwords dropped. */
function contentStems(text: string): string[] {
  return tokens(text)
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
}

interface Term {
  skill: CanonicalSkillId;
  stems: string[];
  /**
   * The term is itself one of the scan's shadow names ("React Testing
   * Library", "Next.js"). Those names are blanked out of the text before
   * matching, so their words never count as already accounted for.
   */
  shadowed: boolean;
}

const SHADOW_KEYS: ReadonlySet<string> = new Set(SCAN_SHADOW_TERMS.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')));

/**
 * Label (a parenthetical is its own term), aliases and id, as stem sets.
 * The scan's stop terms ("three", "testing", "research"…) are left out
 * here too: they're ambiguous words, not evidence of the skill.
 */
const TERMS: readonly Term[] = SKILLS_TABLE.flatMap((skill) => {
  const texts = [skill.label.replace(/\s*\(.*\)\s*/g, ' '), ...(/\((.+)\)/.exec(skill.label)?.slice(1) ?? []), ...skill.aliases, skill.id];
  return texts
    .filter((t) => !SCAN_STOP_TERMS.has(t.toLowerCase()))
    .map((t) => ({
      skill: skill.id as CanonicalSkillId,
      stems: [...new Set(contentStems(t.replace(/-/g, ' ')))],
      shadowed: SHADOW_KEYS.has(t.toLowerCase().replace(/[^a-z0-9]+/g, '')),
    }))
    .filter((t) => t.stems.length > 0);
});

/** How many skills use a stem anywhere in their terms (for IDF weights). */
const DOC_FREQ: ReadonlyMap<string, number> = (() => {
  const bySkill = new Map<string, Set<string>>();
  for (const t of TERMS) {
    for (const s of t.stems) {
      if (!bySkill.has(s)) bySkill.set(s, new Set());
      bySkill.get(s)!.add(t.skill);
    }
  }
  return new Map([...bySkill].map(([s, skills]) => [s, skills.size]));
})();

const weight = (s: string) => (GENERIC_STEMS.has(s) ? 0.25 : 1) / (DOC_FREQ.get(s) ?? 1);

/** Every stem of every term of these skills: words the alias scan already accounted for. */
function stemsOf(skills: readonly string[]): Set<string> {
  return new Set(TERMS.filter((t) => skills.includes(t.skill) && !t.shadowed).flatMap((t) => t.stems));
}

const HINTS: readonly { skill: CanonicalSkillId; stems: string[] }[] = Object.entries(PROPOSAL_HINTS).flatMap(([skill, phrases]) =>
  (phrases ?? []).map((p) => ({ skill: skill as CanonicalSkillId, stems: tokens(p).map(stem) })),
);

/**
 * Whether `needle` occurs in order in `haystack`, allowing at most one extra
 * word between consecutive needle words ("run a small team" has "run a team").
 */
export function containsPhrase(haystack: readonly string[], needle: readonly string[]): boolean {
  if (!needle.length) return false;
  const from = (h: number, n: number): boolean => {
    if (n === needle.length) return true;
    for (let gap = 0; gap <= 1 && h + gap < haystack.length; gap++) {
      if (haystack[h + gap] === needle[n] && from(h + gap + 1, n + 1)) return true;
    }
    return false;
  };
  return haystack.some((word, i) => word === needle[0] && from(i + 1, 1));
}

const SHADOWS = SCAN_SHADOW_TERMS.map((t) => new RegExp(`(?<![A-Za-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'gi'));

export interface Proposal {
  skill: CanonicalSkillId;
  /** 0..1: the best term's matched IDF share, or 1 for a hint phrase. */
  score: number;
  /** What matched, for reading the eval output. */
  via: string;
}

/**
 * Every skill the text might name beyond `exclude`, scored (see
 * `proposeSkills`), best first, unbounded. Exposed for tests and evals.
 */
export function scoreProposals(text: string, exclude: readonly string[] = []): Proposal[] {
  // "React Testing Library" and "Next.js" are names, not mentions of their words.
  const plain = SHADOWS.reduce((t, re) => t.replace(re, ' '), text).replace(/-/g, ' ');
  const content = new Set(contentStems(plain));
  const sequence = tokens(plain).map(stem);
  const claimed = stemsOf(exclude);
  const best = new Map<CanonicalSkillId, Proposal & { matched: number }>();
  const offer = (p: Proposal & { matched: number; stems: string[] }) => {
    if (exclude.includes(p.skill)) return;
    // Every matched word is already part of a skill the scan found.
    if (p.stems.every((s) => claimed.has(s))) return;
    const prev = best.get(p.skill);
    if (!prev || p.score > prev.score || (p.score === prev.score && p.matched > prev.matched)) {
      best.set(p.skill, { skill: p.skill, score: p.score, via: p.via, matched: p.matched });
    }
  };
  for (const term of TERMS) {
    const matched = term.stems.filter((s) => content.has(s));
    if (!matched.length) continue;
    const total = term.stems.reduce((a, s) => a + weight(s), 0);
    const got = matched.reduce((a, s) => a + weight(s), 0);
    const score = got / total;
    if (score > MIN_TERM_SCORE && got >= MIN_MATCHED_WEIGHT) {
      offer({ skill: term.skill, score, via: matched.join('+'), matched: matched.length, stems: matched });
    }
  }
  for (const hint of HINTS) {
    if (containsPhrase(sequence, hint.stems)) {
      offer({ skill: hint.skill, score: 1, via: `"${hint.stems.join(' ')}"`, matched: hint.stems.length, stems: hint.stems });
    }
  }
  const order = new Map(SKILLS_TABLE.map((s, i) => [s.id, i]));
  return [...best.values()]
    .sort((a, b) => b.score - a.score || b.matched - a.matched || order.get(a.skill)! - order.get(b.skill)!)
    .map(({ skill, score, via }) => ({ skill, score, via }));
}

/**
 * Canonical skills a segment might name that code's alias scan didn't find:
 * token and stem overlap with each skill's label, aliases and id (weighted
 * by how rare each stem is across the vocabulary), plus the proposal-only
 * hint phrases. At most MAX_PROPOSALS, best first. These are questions for
 * the model, never additions by themselves.
 */
export function proposeSkills(segment: Pick<Segment, 'text' | 'skills'>): CanonicalSkillId[] {
  return scoreProposals(segment.text, segment.skills)
    .slice(0, MAX_PROPOSALS)
    .map((p) => p.skill);
}
