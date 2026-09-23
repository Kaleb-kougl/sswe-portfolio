import { CORPUS, type Corpus } from '@/data/corpus';
import { GAP_VOCABULARY, SKILLS_TABLE } from '@/data/corpus/skills';

import type { ExtractedRequirement, FitReport } from './contract';
import { judgeRequirement } from './judge';

/**
 * THE NO-MODEL SKILL SCAN — Phase 2c. Runs on every device, instantly.
 *
 * Finds every canonical skill (id, label, alias) and every gap-vocabulary
 * term the JD mentions, as whole words, and judges each one with the same
 * evidence rules as model mode. One row per detected skill, in order of first
 * mention. No coverage: without extraction there are no must-haves.
 *
 * `priority` has no meaning here, but the contract requires it; every row is
 * `SCAN_PRIORITY` and the UI hides priority in scan mode.
 */

/**
 * What the UI shows above a scan-mode report, and what the Markdown export
 * leads with. The scan only knows engineering vocabulary, so on a marketing
 * or sales JD it finds a handful of overlaps and no gaps; this says so.
 */
export const SCAN_DISCLAIMER =
  "Keyword scan: recognises engineering terms only, so it can miss requirements outside that vocabulary and can't tell must-haves from nice-to-haves. There's no coverage score without extracted requirements.";

/** Scan rows aren't must-haves; "nice" is the weaker claim if it ever leaks. */
export const SCAN_PRIORITY = 'nice' as const;

/**
 * Aliases that are right for search but wrong for a keyword scan, because a
 * JD uses the same word for something else. The alias stays in `skills.ts`
 * (MCP search and model mapping still use it); the scan just won't match it
 * bare. Each has a longer spelling that still matches.
 */
export const SCAN_STOP_TERMS: ReadonlySet<string> = new Set([
  'three', // "three years" is not Three.js — "three.js" still matches
  'research', // "user research", "R&D" — "analytical chemistry" still matches
  'agents', // "support agents" — "ai agents" still matches
  'architecture', // "information architecture" — "software architecture" still matches
  'testing', // "A/B testing" — "unit testing", "automated testing" still match
  'performance optimization', // "campaign performance optimization"
  'motion', // "motion graphics"
  'coaching', // "sales coaching" — "mentoring", "mentorship" still match
  'apollo', // Apollo.io, a sales tool — "apollo client", "apollo graphql" still match
  'ecs', // AWS ECS — "entity component system" still matches
  'fp', // "FP&A"
  'dx', // "digital experience"
]);

/**
 * Words that are also ordinary English ("swift delivery", "spark curiosity",
 * "guard rails", "unreal growth"): matched only as capitalised, and added as
 * scan terms even where the vocabulary doesn't list the bare word.
 */
const CASE_SENSITIVE: Readonly<Record<string, readonly string[]>> = {
  go: ['Go'],
  swift: ['Swift'],
  spark: ['Spark'],
  rails: ['Rails'],
  'unreal-engine': ['Unreal'],
};

/**
 * "Go" is a language and a verb. It counts only in a language context:
 * next to a list separator or conjunction, after "in/with/using", or before a
 * word like "services" or "developer". "go-to", "Go to market" and "Go build
 * the future" don't count; "golang" always does.
 */
function goInContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 12), start);
  const after = text.slice(end, end + 24);
  if (/^-|^\s+(?:to|ahead|beyond|above|live|get)\b/i.test(after)) return false;
  if (/(?:\b(?:in|with|using|like|and|or|as)|[,/(&+])\s*$/i.test(before)) return true;
  return /^(?:\s*[,/)&+]|\s+(?:and|or)\b|\s*\.(?:\s|$)|\s*$|\s+(?:programming|language|lang|developer|engineer|services?|microservices|backend|code|experience)\b)/i.test(
    after,
  );
}

const ACCEPT: Readonly<Record<string, (text: string, start: number, end: number) => boolean>> = {
  go: goInContext,
};

interface ScanTerm {
  id: string;
  gap: boolean;
  regex: RegExp;
  /** Lower-cased literal that must appear for the regex to have a chance. */
  prefilter: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The last word of a term matches singular or plural, so "design systems"
 * finds "a design system" and "microservices" finds "microservice design".
 * Only plain words of four letters or more: "css", "aws" and "js" stay exact.
 */
function pluralTolerant(word: string): string {
  if (!/^[A-Za-z]{4,}$/.test(word)) return escape(word);
  if (/ies$/i.test(word)) return `${word.slice(0, -3)}(?:y|ies)`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}(?:y|ies)`;
  if (/[^s]s$/i.test(word)) return `${word.slice(0, -1)}s?`;
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}(?:es)?`;
  return `${word}s?`;
}

/**
 * A term as a whole-word pattern. Letter/digit runs are the words; `+` and
 * `#` stick to them ("C++", "C#"); a leading "." is literal (".NET"); any
 * other punctuation or space becomes an optional separator, so "Node.js",
 * "node js", "NodeJS" and "CI/CD", "CI-CD", "CICD" all match. Boundaries
 * exclude letters and digits on both sides, so "React" never matches
 * "reaction" and "Java" never matches "JavaScript".
 */
export function termPattern(term: string, caseSensitive = false): { source: string; prefilter: string } {
  const words = term.match(/\.?[A-Za-z0-9]+[+#]*/g) ?? [];
  const parts = words.map((w, i) => {
    if (i === 0 && w.startsWith('.')) return '\\.' + escape(w.slice(1));
    const word = w.replace(/^\./, '');
    return i === words.length - 1 && !caseSensitive ? pluralTolerant(word) : escape(word);
  });
  const source = `(?<![A-Za-z0-9])${parts.join('(?:\\s*[./_-]\\s*|\\s+)?')}(?![A-Za-z0-9+#])`;
  // The prefilter is the first word minus any plural ending, so it is a
  // substring of every spelling the pattern accepts.
  const first = (words[0] ?? '').replace(/^\./, '').replace(/[+#]+$/, '').toLowerCase();
  const stem = /^[a-z]{4,}$/.test(first) ? first.replace(/(?:ies|es|s|y)$/, '') : first;
  return { source, prefilter: stem };
}

function compile(id: string, gap: boolean, terms: readonly string[]): ScanTerm[] {
  const sensitive = new Set(CASE_SENSITIVE[id] ?? []);
  const seen = new Set<string>();
  const out: ScanTerm[] = [];
  for (const term of terms) {
    if (SCAN_STOP_TERMS.has(term.toLowerCase())) continue;
    const { source, prefilter } = termPattern(term, sensitive.has(term));
    const flags = sensitive.has(term) ? 'g' : 'gi';
    if (!prefilter || seen.has(source + flags)) continue;
    seen.add(source + flags);
    out.push({ id, gap, regex: new RegExp(source, flags), prefilter });
  }
  return out;
}

/*
 * Compiled once per module load. Canonical skills match on id, label and
 * aliases. Gap terms match on label and aliases only: their ids are
 * internal keys, and some ("go", "rails", "spark") are ordinary words. A
 * word listed in CASE_SENSITIVE replaces any case-insensitive spelling of it.
 */
function gapTerms(id: string, terms: readonly string[]): string[] {
  const sensitive = CASE_SENSITIVE[id] ?? [];
  const folded = new Set(sensitive.map((t) => t.toLowerCase()));
  return [...terms.filter((t) => !folded.has(t.toLowerCase())), ...sensitive];
}

/**
 * Names that contain a vocabulary word but aren't that skill, and that this
 * scan neither claims nor lists as a gap: "Next.js" is not a mention of
 * JavaScript ("JS"). They take part in the longest-match rule so the shorter
 * word inside them doesn't count, then produce no row.
 */
export const SCAN_SHADOW_TERMS: readonly string[] = [
  'Next.js',
  'Nuxt.js',
  'Nest.js',
  'Express.js',
  'D3.js',
  'Ember.js',
  'Backbone.js',
  'Chart.js',
];
const SHADOW = '';

const SCAN_TERMS: readonly ScanTerm[] = [
  ...SKILLS_TABLE.flatMap((s) => compile(s.id, false, [s.id, s.label, ...s.aliases])),
  ...GAP_VOCABULARY.flatMap((t) => compile(t.id, true, gapTerms(t.id, [t.label, ...t.aliases]))),
  ...compile(SHADOW, false, SCAN_SHADOW_TERMS),
];

interface Hit {
  id: string;
  gap: boolean;
  start: number;
  end: number;
}

/**
 * Every skill the text mentions, in order of first mention. Where one
 * match sits inside a longer match for another skill ("JS" in "Node.js",
 * "React" in "React Native"), only the longer one counts at that spot.
 */
export function detectSkills(text: string): { id: string; gap: boolean }[] {
  const lower = text.toLowerCase();
  const hits: Hit[] = [];
  for (const term of SCAN_TERMS) {
    if (!lower.includes(term.prefilter)) continue;
    term.regex.lastIndex = 0;
    for (let m = term.regex.exec(text); m; m = term.regex.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        term.regex.lastIndex++;
        continue;
      }
      if (ACCEPT[term.id] && !ACCEPT[term.id](text, start, end)) continue;
      hits.push({ id: term.id, gap: term.gap, start, end });
    }
  }

  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Hit[] = [];
  for (const hit of hits) {
    const covered = kept.some((k) => k.id !== hit.id && k.start <= hit.start && hit.end <= k.end);
    if (!covered) kept.push(hit);
  }

  const first = new Map<string, Hit>();
  for (const hit of kept) {
    const seen = first.get(hit.id);
    if (!seen || hit.start < seen.start) first.set(hit.id, hit);
  }
  return [...first.values()]
    .filter((hit) => hit.id !== SHADOW)
    .sort((a, b) => a.start - b.start)
    .map(({ id, gap }) => ({ id, gap }));
}

/**
 * A title for the report: the JD's first line when it is short enough to be
 * one (after list markers and Markdown heading marks), otherwise a plain
 * "Job description". The scan has no model to read the title properly.
 */
export function scanRole(jd: string): string {
  const line = jd
    .split('\n')
    .map((l) => l.replace(/^[\s#*>•-]+/, '').replace(/[\s:*]+$/, ''))
    .find(Boolean);
  return line && line.length >= 3 && line.length <= 80 ? line : 'Job description';
}

const GAP_LABELS: ReadonlyMap<string, string> = new Map(GAP_VOCABULARY.map((t) => [t.id, t.label]));

/** The scan-mode report. Pure; no network, no model. */
export function scanJd(jd: string, corpus: Corpus = CORPUS, now: Date = new Date()): FitReport {
  const labels = new Map(corpus.skills.map((s) => [s.id, s.label]));
  const requirements = detectSkills(jd).map(({ id, gap }) => {
    const label = gap ? GAP_LABELS.get(id)! : (labels.get(id) ?? id);
    const row: ExtractedRequirement = {
      text: label,
      priority: SCAN_PRIORITY,
      skills: gap ? [] : [id],
      otherSkills: gap ? [label] : [],
      minYears: null,
    };
    return judgeRequirement(row, corpus, now);
  });
  return { role: scanRole(jd), mode: 'scan', requirements, coverage: null };
}
