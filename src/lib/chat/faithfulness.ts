import { detectSkills } from '@/lib/fit/scan';

import type { ChatContext, ContextRow } from './context';

/**
 * FAITHFULNESS CHECKER: deterministic, per sentence, no model.
 *
 * Given an answer and the ChatContext it was generated from, it flags each
 * sentence that says something TOOL_OUTPUT doesn't:
 *   (a) number   — a figure not in TOOL_OUTPUT (20% = 20 percent; 680M =
 *                  680 million = 680,000,000; 6 MB = 6MB; "six" = 6);
 *   (b) skill    — a skill (canonical or gap vocabulary) TOOL_OUTPUT never names;
 *   (c) entity   — a company or project name (the corpus's, or a well-known
 *                  employer) TOOL_OUTPUT never names;
 *   (d) gap-as-strength — a clause that mentions a no-evidence skill or
 *                  requirement without a negation or absence cue;
 *   (e) verdict  — fit language the rows don't support: "strong/perfect fit"
 *                  unless every must-have is strong, "strong" about a row that
 *                  isn't, "no evidence" about a row that is strong or a
 *                  skill search_evidence found.
 * `firstPerson` is recorded as a style note, not a faithfulness failure.
 *
 * BLIND SPOTS (why the evals also hand-review answers): paraphrased
 * overclaims with no skill word, number or verdict word ("he's clearly
 * senior enough", "he'd ramp up fast"); a true number bound to the wrong
 * fact ("led a team of 10" when 10 is only the IBM team's size); a
 * negation that doesn't negate the claim ("not only Go but Rust").
 */

export type FlagKind = 'number' | 'skill' | 'entity' | 'gap-as-strength' | 'verdict';

export interface Flag {
  kind: FlagKind;
  /** The offending token: "10", "Kubernetes", "Google", "strong fit". */
  detail: string;
}

export interface SentenceCheck {
  text: string;
  flags: Flag[];
  firstPerson: boolean;
}

export interface AnswerCheck {
  sentences: SentenceCheck[];
  flagged: number;
  /** No flags on any sentence. */
  faithful: boolean;
  counts: Record<FlagKind, number>;
}

// ------------------------------------------------------------ sentences

const ABBREVIATIONS = ['J.B.', 'e.g.', 'i.e.', 'etc.', 'vs.', 'Inc.', 'Jr.', 'Sr.', 'Dr.', 'U.S.', 'approx.'];
const DOT = '\u0000';

/** Splits prose into sentences, keeping "J.B. Hunt", "Node.js" and "2.1" whole. */
export function splitSentences(text: string): string[] {
  let t = text.replace(/\r/g, '');
  for (const a of ABBREVIATIONS) t = t.split(a).join(a.replace(/\./g, DOT));
  return t
    .split(/(?<=[.!?])["”')\]]*\s+(?=["“'(\[]?[A-Z0-9])|\n+/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').split(DOT).join('.').trim())
    .filter((s) => /[A-Za-z0-9]/.test(s));
}

/** Contrastive joins start a new claim; a plain comma list doesn't. */
function clauses(sentence: string): string[] {
  return sentence
    .split(/;|\s+-\s+|—|,?\s+\b(?:but|while|although|though|whereas|however|yet)\b|,\s*and\s+(?=he\b|kaleb\b|his\b|there\b)|\.\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

const NEGATION =
  /\b(?:no|not|never|none|nothing|neither|nor|without|lacks?|lacking|missing|absent|gaps?|cannot|unable|unclear|unknown|unverified|unsupported|doesn't|does not|don't|didn't|isn't|aren't|wasn't|hasn't|haven't|can't|won't|no evidence|not assessed|outside)\b|n['’]t\b/i;

const hasNegation = (text: string) => NEGATION.test(text);

// ------------------------------------------------------------ (a) numbers

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
};

const NUM =
  /(?<![A-Za-z0-9.])[~≈$]?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|percent\b|per cent\b|×|x(?![A-Za-z])|times\b|million\b|m(?![A-Za-z])|billion\b|bn?(?![A-Za-z])|thousand\b|k(?![A-Za-z])|kb\b|mb\b|gb\b)?/gi;
const WORD_NUM = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b(?:\\s*(percent|%|times|million|thousand))?`, 'gi');

function normalizeNumber(value: number, unitRaw: string | undefined): string {
  const unit = (unitRaw ?? '').toLowerCase().trim();
  let v = value;
  let u = '';
  if (unit === '%' || unit.startsWith('percent') || unit.startsWith('per cent')) u = '%';
  else if (unit === 'x' || unit === '×' || unit === 'times') u = 'x';
  else if (unit === 'million' || unit === 'm') v *= 1e6;
  else if (unit === 'billion' || unit === 'b' || unit === 'bn') v *= 1e9;
  else if (unit === 'thousand' || unit === 'k') v *= 1e3;
  else if (unit === 'kb' || unit === 'mb' || unit === 'gb') u = unit.toUpperCase();
  return `${Number(v.toPrecision(12))}${u}`;
}

/** Every figure in `text`, normalized: "20%", "680000000", "6MB", "29x", "6". */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUM)) out.push(normalizeNumber(Number(m[1].replace(/,/g, '')), m[2]));
  for (const m of text.matchAll(WORD_NUM)) out.push(normalizeNumber(NUMBER_WORDS[m[1].toLowerCase()], m[2]));
  return out;
}

// ------------------------------------------------------------ (c) entities

/**
 * Names the checker knows: the corpus's employers, projects and products,
 * and a few big employers a small model likes to invent. Matched with case
 * (so "indeed" the adverb and "meta" the prefix don't count).
 */
export const ENTITIES: readonly { name: string; pattern: RegExp }[] = [
  ...[
    'IBM', 'J.B. Hunt', 'JB Hunt', 'OneHost', 'Horizon', 'Luxon', 'GolfTV', 'Watson Media', 'IBM Developer',
    'BonkBall', 'Flamework', 'Reflex', 'SimplePath', 'Framer Motion', 'Analytical Chemistry', 'Northwestern',
    'Agentic AI Video Creator', 'Indeed Analytics Extension',
    'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Apple', 'Netflix', 'OpenAI', 'Anthropic', 'Stripe',
    'Uber', 'Airbnb', 'Salesforce', 'Oracle', 'Adobe', 'Spotify', 'Shopify', 'Twitter', 'LinkedIn',
  ].map((name) => ({ name, pattern: new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`) })),
  // "Indeed" the company, not "Indeed," opening a sentence.
  { name: 'Indeed', pattern: /(?<![A-Za-z0-9])Indeed(?:\.com)?(?![A-Za-z0-9])(?!,)/ },
  { name: 'r3f-projectiles', pattern: /\br3f[- ]projectiles\b/i },
  { name: 'roblox-css', pattern: /\broblox[- ]css\b/i },
];

function entitiesIn(text: string): string[] {
  return ENTITIES.filter((e) => e.pattern.test(text)).map((e) => e.name);
}

// ------------------------------------------------------------ (d)/(e) rows

const STOP = new Set(
  'with and the for from that this have has had into your you our their they them will able strong experience years year plus using work working building build knowledge understanding ability skills skill other such including across within about more than least' .split(
    ' ',
  ),
);

function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []).map((w) => w.replace(/[.-]+$/, '')).filter((w) => !STOP.has(w)));
}

/** Rows a clause talks about: a shared skill, or three shared content words. */
function rowsReferenced(clause: string, clauseSkills: readonly string[], rows: readonly ContextRow[]): ContextRow[] {
  const words = contentWords(clause);
  return rows.filter((r) => {
    if (r.skills.some((s) => clauseSkills.includes(s))) return true;
    const rowWords = contentWords(r.requirement);
    if (rowWords.size < 2) return false;
    let shared = 0;
    for (const w of rowWords) if (words.has(w)) shared++;
    return shared >= Math.min(3, rowWords.size);
  });
}

const OVERALL_FIT =
  /\b(?:(?:perfect|ideal|excellent|great|strong|outstanding|exceptional|top|best|solid|good|very good|natural|clear)\s+(?:fit|match|candidate|choice)|(?:meets|matches|covers|satisfies|checks)\s+(?:all|every|each)|fully\s+(?:qualified|meets|matches|covers)|highly qualified|well[- ]qualified|well[- ]suited|more than qualified|exactly what)\b/i;
const STRONG_WORDS = /\b(?:strong(?:ly)?|extensive|deep|expert(?:ise)?|proven|solid|significant|substantial|advanced|mastery|proficient)\b/i;
const PARTIAL_WORDS = /\b(?:partial(?:ly)?|some evidence|limited)\b/i;
const NONE_WORDS = /\b(?:no evidence|gap|lacks?|not (?:shown|listed|mentioned|covered))\b/i;

// ------------------------------------------------------------ check

/** The allowed sets, computed once per context. */
export interface Allowed {
  numbers: Set<string>;
  skills: Set<string>;
  entities: Set<string>;
}

export function allowedFrom(ctx: ChatContext): Allowed {
  return {
    numbers: new Set(extractNumbers(ctx.text)),
    skills: new Set([...detectSkills(ctx.text).map((s) => s.id), ...ctx.facts.supportedSkills, ...ctx.facts.unsupportedSkills]),
    entities: new Set(entitiesIn(ctx.text)),
  };
}

export function checkSentence(sentence: string, ctx: ChatContext, allowed: Allowed = allowedFrom(ctx)): SentenceCheck {
  const flags: Flag[] = [];
  const add = (kind: FlagKind, detail: string) => {
    if (!flags.some((f) => f.kind === kind && f.detail === detail)) flags.push({ kind, detail });
  };

  for (const n of extractNumbers(sentence)) if (!allowed.numbers.has(n)) add('number', n);

  const skills = detectSkills(sentence).map((s) => s.id);
  for (const s of skills) if (!allowed.skills.has(s)) add('skill', s);

  for (const e of entitiesIn(sentence)) if (!allowed.entities.has(e)) add('entity', e);

  const { rows, unsupportedSkills, allMustStrong } = ctx.facts;
  for (const clause of clauses(sentence)) {
    const negated = hasNegation(clause);
    const clauseSkills = detectSkills(clause).map((s) => s.id);

    // (d) a no-evidence skill or requirement, stated without an absence cue.
    if (!negated) {
      for (const s of clauseSkills) if (unsupportedSkills.includes(s)) add('gap-as-strength', s);
    }
    const referenced = rowsReferenced(clause, clauseSkills, rows);
    for (const r of referenced) {
      const noEvidence = r.verdict === 'gap' || r.verdict === 'not_assessed';
      if (noEvidence && !negated) add('gap-as-strength', r.requirement);
      // (e) verdict words about a specific row.
      if (!negated && STRONG_WORDS.test(clause) && r.verdict !== 'strong') add('verdict', `strong: ${r.requirement}`);
      if (PARTIAL_WORDS.test(clause) && r.verdict === 'strong' && !referenced.some((x) => x.verdict === 'partial')) {
        add('verdict', `partial: ${r.requirement}`);
      }
      if (negated && NONE_WORDS.test(clause) && r.verdict === 'strong' && referenced.every((x) => x.verdict === 'strong')) {
        add('verdict', `none: ${r.requirement}`);
      }
    }

    // (e) "no evidence" about a skill search_evidence did find (an underclaim).
    // Added after the pilot run with Qwen2.5-0.5B ("no evidence ... on GraphQL").
    if (negated && ctx.tool === 'search_evidence') {
      for (const s of clauseSkills) {
        if (ctx.facts.supportedSkills.includes(s) && !unsupportedSkills.includes(s)) add('verdict', `none: ${s}`);
      }
    }

    // (e) overall fit language: only when every must-have row is strong.
    const fit = OVERALL_FIT.exec(clause);
    if (fit && !negated && !(ctx.tool === 'check_fit' && allMustStrong)) add('verdict', fit[0].toLowerCase());
  }

  return { text: sentence, flags, firstPerson: /\b(?:I|I'm|I’m|I've|I’ve|my|me)\b/.test(sentence) };
}

export function checkAnswer(answer: string, ctx: ChatContext): AnswerCheck {
  const allowed = allowedFrom(ctx);
  const sentences = splitSentences(answer).map((s) => checkSentence(s, ctx, allowed));
  const counts: Record<FlagKind, number> = { number: 0, skill: 0, entity: 0, 'gap-as-strength': 0, verdict: 0 };
  for (const s of sentences) for (const f of s.flags) counts[f.kind]++;
  const flagged = sentences.filter((s) => s.flags.length > 0).length;
  return { sentences, flagged, faithful: flagged === 0, counts };
}

/**
 * Output cleanup before checking: Qwen3's chat template emits an empty
 * `<think></think>` block even with thinking switched off.
 */
export function cleanAnswer(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/?think>/g, '').trim();
}

/** What's left when every sentence was flagged: the UI shows the tool's evidence right below. */
export const FILTER_FALLBACK = 'See the evidence below.';

/** Drops flagged sentences; returns the fallback line if none survive. */
export function filterAnswer(answer: string, ctx: ChatContext): { text: string; dropped: number; kept: number; fallback: boolean } {
  const check = checkAnswer(answer, ctx);
  const kept = check.sentences.filter((s) => s.flags.length === 0).map((s) => s.text);
  if (kept.length === 0) return { text: FILTER_FALLBACK, dropped: check.sentences.length, kept: 0, fallback: true };
  return { text: kept.join(' '), dropped: check.flagged, kept: kept.length, fallback: false };
}
