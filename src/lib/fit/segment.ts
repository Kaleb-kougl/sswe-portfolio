import {
  MAX_CANDIDATES,
  type CanonicalSkillId,
  type Section,
  type Segment,
  type SegmentedJd,
} from './contract';
import { ROLE_FALLBACK } from './judge';
import { detectSkills } from './scan';
import { GAP_VOCABULARY } from '@/data/corpus/skills';

/**
 * SEGMENTATION: steps 1–6 of the code-first pipeline (plan v4, Phase 2a).
 *
 * Code turns a pasted JD into segments and finds everything it can decide
 * without a model: each segment's section, its priority from the section
 * header or an inline cue, the skills it names, and any minimum years. The
 * model (or `defaultDecision`) then only says, per candidate segment,
 * whether it is a requirement.
 *
 * Segment text is the JD's own words: bullet markers, Markdown emphasis and
 * extra whitespace are stripped, and hard-wrapped lines are rejoined, but
 * nothing is paraphrased.
 *
 * Pure and synchronous; no DOM or Node APIs, so it runs in the worker too.
 */

// --- Header lexicon ---------------------------------------------------------

/**
 * Section headers, matched against the whole normalised header (lower case,
 * curly quotes straightened, leading emoji and trailing ":" or "?" removed).
 * Checked in this order, so "preferred qualifications" is `preferred` before
 * "qualifications" can make it `requirements`, and "about you" and "about the
 * role" are claimed before "about …" becomes `about`.
 */
export const HEADER_LEXICON: readonly (readonly [Section, RegExp])[] = [
  [
    'preferred',
    new RegExp(
      '^(?:' +
        [
          "(?:preferred|desired|desirable|bonus|additional|optional|nice[- ]to[- ]have|good[- ]to[- ]have)(?: (?:skills?|qualifications?|experience|requirements?|points?|skills (?:and|&) (?:experience|qualifications)))?",
          'nice[- ]to[- ]haves',
          'pluses',
          '(?:bonus|extra) (?:points|credit)(?: if.*)?',
          "(?:it'?s |it is )?(?:a )?(?:big |huge )?plus(?: if.*)?",
          'even better(?: if.*)?',
          "(?:it would|it'?d|would) be (?:great|nice|awesome|a plus)(?: if.*)?",
          '(?:what )?(?:would )?(?:set|sets) you apart',
          "(?:what )?(?:would )?make[s]? you stand out",
          'you might also have',
          '(?:strong |great |ideal )?candidates (?:may|might|will) also have(?: experience(?: with| in)?)?',
          'ideally(?:,? you (?:have|bring|also have))?',
          '(?:suggested|recommended) (?:skills?|qualifications?|experience)',
        ].join('|') +
        ')$',
    ),
  ],
  [
    'requirements',
    new RegExp(
      '^(?:' +
        [
          '(?:minimum|basic|required|key|core|essential|mandatory|job|technical|must[- ]have) (?:qualifications?|requirements?|skills?|experience|competencies)(?: (?:and|&) (?:experience|qualifications?|skills?|abilities))?',
          '(?:qualifications?|requirements?|skills?|experience|competencies)(?: (?:and|&) (?:experience|qualifications?|skills?|abilities|requirements?|education))?',
          'required',
          'must[- ]haves?',
          '(?:education|education (?:and|&) experience)',
          "what you(?:'ll| will)? (?:bring|need|have)(?: to (?:succeed|be successful|the (?:team|table)|our team))?",
          '(?:the )?essentials',
          "what (?:we'?re|we are) (?:looking|hoping) for(?: in you)?",
          'what we look for',
          'what we need(?: from you)?',
          'who (?:you are|we are looking for|we\'?re looking for)',
          'about you',
          "you(?:'ll)? (?:have|bring|need|are)",
          'your (?:background|experience|skills|profile|qualifications|toolkit)(?: (?:and|&) (?:experience|skills|qualifications|background))?',
          '(?:the )?ideal candidate(?: (?:will )?(?:have|has|is))?',
          'is (?:this|that) you',
          "to be successful(?: in this role)?(?:,? you(?:'ll| will) (?:need|have))?",
          "we'?d love (?:it )?if you (?:have|had)",
          // Fit-check headers ("You might thrive in this role if you…"): ambiguous
          // between must and nice, and read as must (the requirement list).
          "what you should (?:have|bring|know)",
          "(?:the )?(?:skill ?sets?|skills?|experience|qualifications|background) you(?:'ll| will| should)? (?:bring|need|have)",
          "you(?:'ll| will)? (?:might |may )?(?:thrive|excel|succeed|do well)(?: in this (?:role|position|job)| here| with us)?(?: if(?: you(?:'re| are| have)?)?)?",
          "(?:you'?re|you are|you may be|you might be) (?:a )?(?:great |good |strong )?(?:fit|match)(?: for (?:this|the) (?:role|position|job))?(?: if(?: you(?: have| are|'re)?)?)?",
          "this (?:role|job|position) (?:is|might be|may be) (?:for you|a (?:great |good )?fit)(?: if(?: you)?)?",
        ].join('|') +
        ')$',
    ),
  ],
  [
    'responsibilities',
    new RegExp(
      '^(?:' +
        [
          '(?:key |main |core |primary |your |job |role )?(?:responsibilities|duties)',
          "what you(?:'ll| will) (?:do|be doing|work on|own|build|accomplish|achieve)(?: here| with us)?",
          "(?:in )?(?:this|the) role(?:,? you(?:'ll| will))?",
          'your role',
          '(?:the )?(?:role|job|position) (?:overview|description|summary)',
          'about the (?:role|position|job|opportunity|work)',
          'the (?:opportunity|position|job|work)',
          'day[- ]to[- ]day',
          '(?:a )?day in the life',
          'your (?:impact|mission|day[- ]to[- ]day)',
          "(?:the )?impact you(?:'ll| will) (?:have|make)",
          "you(?:'ll| will)",
          'how you(?:\'ll| will) (?:contribute|help|make an impact)',
        ].join('|') +
        ')$',
    ),
  ],
  [
    'benefits',
    new RegExp(
      '^(?:' +
        [
          '(?:our |company |employee )?(?:benefits|perks)(?: (?:and|&) (?:perks|benefits))?',
          'compensation(?: (?:and|&) benefits)?(?: range)?',
          '(?:base )?(?:salary|pay)(?: range| transparency| and benefits)?',
          '(?:total )?rewards',
          'what we offer(?: you)?',
          'we offer',
          "what'?s in it for you",
          "why (?:you'?ll love (?:working )?(?:here|with us|it here)|join us|work (?:with|for|at) us)",
          'equal (?:employment )?opportunity(?: employer| statement)?',
          'eeo(?: statement)?',
          '(?:our )?(?:commitment to )?diversity(?:,? equity)?(?: (?:and|&) inclusion)?(?: statement)?',
          '(?:reasonable )?accommodations?',
          '(?:work )?location(?: (?:and|&) (?:hours|schedule))?',
          'work (?:arrangement|schedule)',
          'how to apply',
          '(?:the )?(?:application|interview|hiring) process',
          'next steps',
          'privacy(?: notice| policy)?',
          "(?:you(?:'ll| will) )?benefit from (?:our|the) [a-z ]{1,30}",
        ].join('|') +
        ')$',
    ),
  ],
  [
    'about',
    new RegExp(
      '^(?:' +
        [
          'about(?: [a-z0-9&.\' -]{1,40})?',
          'who we are',
          'our (?:story|mission|team|company|culture|values)',
          '(?:the )?(?:team|company)',
          'company (?:overview|description|background)',
          'meet the team',
          'life at .{1,40}',
          // Outcomes ("What success looks like", "Your first 90 days"): what the
          // employer expects after hiring, not what the candidate brings or does.
          '(?:what )?success (?:in this (?:role|position) )?(?:looks like|means)(?: in (?:this|the) role)?',
          "(?:in )?(?:your )?first (?:\\d{1,3}|thirty|sixty|ninety) days(?: (?:and|&) beyond)?",
          '(?:in )?(?:your )?first (?:week|weeks|month|months|year|six months|few months)',
          '\\d{2}[/-]\\d{2}(?:[/-]\\d{2,3})?(?: days?)?(?: plan)?',
          // "Why Acme?", "Why this role": the pitch, not a requirement ("why
          // join us" and "why you'll love it here" are benefits, checked first).
          "why (?!you\\b)[a-z0-9&.' -]{1,40}",
          "why you should (?:join|work)(?: [a-z0-9&.' -]{1,40})?",
          "(?:engineering|working|culture|careers?|the team) at [a-z0-9&.' -]{1,40}",
          // A tech-environment list ("Technologies we use:")
          // describes the employer's stack; the requirements say which of it
          // the candidate needs. Only when worded as the employer's: a bare
          // "Tech stack" or "Our tools" header may lead in skills the
          // candidate needs, so it stays unknown.
          "(?:our |the )?tech(?:nology)? stack (?:we use|includes|is)",
          "(?:the )?(?:technologies|tools|stack) we (?:use|work with)",
          '(?:relevant |key )?(?:technologies|tools) (?:include|includes)',
        ].join('|') +
        ')$',
    ),
  ],
];

/** "What You'll Do:" → "what you'll do". Leading emoji and marks go too. */
export function normalizeHeader(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[*_#`]+/g, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[\s:?!.…\-–—]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * A header prefixed with the job title: "Software Engineer, Product
 * Responsibilities", "Senior Engineer Minimum Qualifications". Only Title
 * Case words that include a job noun (TITLE_ROLE) before the section word,
 * so a sentence fragment ("Ability to translate business requirements") or
 * a Title Case duty ("Translate Product Requirements") never matches.
 */
const TITLED_HEADER =
  /^(?:[A-Z][\w&/.'’+-]*,?\s+){1,6}((?:(?:Key|Main|Core|Minimum|Basic|Required|Preferred|Desired|Job)\s+)?(?:Responsibilities|Qualifications|Requirements|Duties))$/;

const TITLE_ROLE =
  /\b(?:engineer|developer|programmer|architect|scientist|analyst|designer|manager|director|intern|sre|consultant|specialist)s?\b/i;

/** The section a header names, or undefined when it isn't one in the lexicon. */
export function classifyHeader(text: string): Section | undefined {
  const header = normalizeHeader(text);
  // "You may be a good fit if you have (Must-have qualifications)": the
  // bracketed part names the section when the rest doesn't.
  const bracket = /^(.{3,80}?)\s*\(([^()]{3,60})\)$/.exec(header);
  if (bracket && bracket[1].split(' ').length <= 10) {
    const inner = classifyHeader(bracket[2]) ?? classifyHeader(bracket[1]);
    if (inner) return inner;
  }
  if (!header || header.split(' ').length > 10) return undefined;
  for (const [section, pattern] of HEADER_LEXICON) {
    if (pattern.test(header)) return section;
  }
  const titled = TITLED_HEADER.exec(
    text.replace(/[*_#`]+/g, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s:]+$/, '').trim(),
  );
  // The prefix must read as a job title ("Software Engineer, Product").
  const prefix = titled ? titled[0].slice(0, -titled[1].length) : '';
  return titled && TITLE_ROLE.test(prefix) ? classifyHeader(titled[1]) : undefined;
}

// --- Priority cues ----------------------------------------------------------

/** Inline words that make any segment a nice-to-have, whatever its header says. */
export const NICE_CUE =
  /\b(?:preferred|(?:is |would be )?an? (?:big |huge |strong |definite )?(?:plus|bonus|advantage)|bonus(?: points)?|nice[- ]to[- ]have|good[- ]to[- ]have|ideally|desirable|advantageous|not required)\b|\bplus!/i;

/**
 * Inline words that make a segment a must-have, used only where no header
 * gave a priority (the headerless or unknown section), so a prose-only JD's
 * "5+ years of Go required" still counts toward coverage. "Not required"
 * is a nice cue and is checked first.
 */
export const MUST_CUE = /\b(?:required|requirement|must(?: have| be| know)?|mandatory|essential)\b/i;

const SECTION_PRIORITY: Readonly<Record<Section, 'must' | 'nice' | null>> = {
  requirements: 'must',
  preferred: 'nice',
  responsibilities: null,
  about: null,
  benefits: null,
  unknown: null,
};

/** A segment's priority from its section, then any inline cue (see NICE_CUE, MUST_CUE). */
export function segmentPriority(section: Section, text: string): 'must' | 'nice' | null {
  if (section === 'about' || section === 'benefits') return null;
  if (NICE_CUE.test(text)) return 'nice';
  const fromHeader = SECTION_PRIORITY[section];
  if (fromHeader) return fromHeader;
  return section === 'unknown' && MUST_CUE.test(text) ? 'must' : null;
}

// --- Years ------------------------------------------------------------------

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
/** "five (5)" — a spelled number with the digits repeated in brackets. */
const ECHO = '(?:\\s*\\(\\d{1,2}\\+?\\))?';
const YEARS_RE = new RegExp(
  `(?<![\\d$.,])\\b${NUM}${ECHO}\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*${NUM}${ECHO}\\s*\\+?\\s*)?(?:or more\\s+|plus\\s+)?-?(?:years?|yrs?)\\b(?!\\s+(?:ago|old|in a row|running|since)\\b)`,
  'gi',
);

const toNumber = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? Number(s);

/**
 * The minimum years a segment asks for, or null. "5+ years" → 5, "at least
 * five years" → 5, "3-5 years" and "three to five years" → 3 (a range's
 * lower end). "10 years ago" and "a 2 year old company" don't count. With
 * several mentions ("5+ years overall, 2+ with React") the largest minimum
 * wins, as the one a candidate has to clear. Values over 30 are ignored.
 */
export function parseMinYears(text: string): number | null {
  let best: number | null = null;
  YEARS_RE.lastIndex = 0;
  for (let m = YEARS_RE.exec(text); m; m = YEARS_RE.exec(text)) {
    const value = toNumber(m[1]);
    if (!Number.isInteger(value) || value < 0 || value > 30) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

/** Words that make "N years in/of …" years of software work. */
const SOFTWARE_WORK =
  /\b(?:software|engineer(?:s|ing)?|develop(?:er|ers|ment|ing)?|programming|coding|code|web|front[- ]?end|back[- ]?end|full[- ]?stack|technical|technolog(?:y|ies)|tech|platform|infrastructure|systems?|computer science|applications?|services?|devops|sre|data)\b/i;
/** What may surround a bare years clause: "5+ years of relevant professional experience". */
const GENERIC_YEARS_WORDS =
  /^(?:at|least|a|an|the|minimum|min|of|in|with|or|more|plus|and|over|relevant|professional|industry|work|working|hands-on|related|total|overall|proven|prior|combined|experience|required|preferred|ideally|you|have|years?|yrs?|\d+|[a-z]+teen|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;

/**
 * Whether a segment's years are years of software work, which is all the
 * judge can compare (it counts years in software). True when the segment
 * names a skill, names software work, or says nothing about the field
 * ("5+ years of professional experience"). "5+ years in B2B content
 * marketing" is false: it keeps no minimum, so it judges as not assessed
 * instead of "meets the 5 asked".
 */
export function yearsAreSoftware(text: string, namesSkill: boolean): boolean {
  if (namesSkill || SOFTWARE_WORK.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  return words.every((w) => GENERIC_YEARS_WORDS.test(w));
}

// --- Role -------------------------------------------------------------------

const ROLE_WORD =
  /\b(?:engineer|developer|programmer|architect|scientist|analyst|designer|manager|director|lead|head|vp|officer|specialist|consultant|intern|administrator|coordinator|associate|representative|writer|marketer|recruiter|strategist|researcher|sre|devops|technician|executive|owner|product|staff|principal)s?\b/i;
const TITLE_LABEL = /^(?:job title|title|position|role|job)\s*:\s*(.+)$/i;
const HIRING =
  /\b(?:we(?:'re| are) (?:hiring|looking for|seeking|searching for)|(?:is|are) (?:hiring|looking for|seeking)|seeking)\s+(?:an?\s+|our (?:next|first)\s+)?([^.,;!?]{3,80}?)(?=\s+(?:to|who|with|that|for|in|at|on|and join)\b|[.,;!?(]|$)/i;

const cleanLine = (line: string) =>
  line
    .replace(/^\s*(?:#{1,6}\s+|[-*•·>]\s+)?/, '')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:]+$/, '')
    .trim();

/** A line that reads as a job title: short, no sentence punctuation, names a role. */
function looksLikeTitle(line: string): boolean {
  if (line.length < 3 || line.length > 100) return false;
  if (line.split(' ').length > 12 || /[.!?]$/.test(line)) return false;
  if (classifyHeader(line)) return false;
  return ROLE_WORD.test(line);
}

/**
 * The role, and which raw line it came from (so that line isn't also a
 * segment). In order: a "Job title:" line; the first title-like line among
 * the first five; "We're hiring a …" in the first lines; otherwise
 * ROLE_FALLBACK. Never guesses from the body.
 */
export function findRole(lines: readonly string[]): { role: string; line: number | null } {
  const early = lines.map((raw, i) => ({ text: cleanLine(raw), i })).filter((l) => l.text);
  for (const { text, i } of early.slice(0, 15)) {
    const label = TITLE_LABEL.exec(text);
    if (label && label[1].trim().length >= 3) return { role: clip(label[1].trim()), line: i };
  }
  for (const { text, i } of early.slice(0, 5)) {
    if (looksLikeTitle(text)) return { role: clip(text), line: i };
  }
  for (const { text } of early.slice(0, 8)) {
    const hiring = HIRING.exec(text);
    if (hiring && ROLE_WORD.test(hiring[1])) return { role: clip(hiring[1].trim()), line: null };
  }
  return { role: ROLE_FALLBACK, line: null };
}

const clip = (s: string) => (s.length > 120 ? `${s.slice(0, 119)}…` : s);

// --- Line splitting -----------------------------------------------------------

/** Bullet markers: ASCII and typographic, numbered and lettered lists, emoji. */
const BULLET =
  /^(?:[-*+](?=\s)|[•·–—▪▫◦●○■□►▸➤➢→✓✔☑❖◆◇]|\(?\d{1,2}[.)](?=\s)|\(?[a-z]\)(?=\s)|\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)\s*/u;
/** Bullets that appear mid-line when a list is pasted flat: "Skills: • React • Go". */
const INLINE_BULLET = /\s+[•·▪●◦]\s+/;
const RULE = /^\s*(?:[-*_=]\s*){3,}$/;

interface Item {
  text: string;
  section: Section;
  bullet: boolean;
  indent: number;
  /** Raw line index this item started on. */
  line: number;
  /** Last raw line index; a blank line after it ends the paragraph. */
  lastLine: number;
  /** True once nested bullets have been folded into it. */
  parent: boolean;
}

const indentOf = (line: string) => {
  const lead = /^[ \t ]*/.exec(line)![0];
  return [...lead].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0);
};

/** Words a hard-wrapped line can end on mid-phrase. */
const DANGLING = /(?:[,(&/–—-]|\b(?:and|or|with|of|in|to|the|a|an|for|on|using|including|such as|like|via|across|from|by|at|as))$/i;

/** Remove Markdown emphasis and collapse whitespace; the words are untouched. */
function tidy(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,;:])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

type HeaderMatch = { section: Section; rest: string } | undefined;

/**
 * Whether a line is a section header, and what follows it on the same line.
 *
 * - `## Requirements`, `**Requirements**`: a header; unrecognised ones start
 *   an `unknown` section.
 * - `Requirements:` or a bare `Requirements`: a header if the lexicon knows it.
 * - `Requirements: 5+ years of React`: a header with inline content.
 * - An unrecognised `Something:` line is a header only outside a requirements,
 *   preferred or responsibilities list (inside one it's a lead-in like
 *   "Experience with one of:").
 */
function matchHeader(raw: string, bullet: boolean, current: Section): HeaderMatch {
  const line = raw.trim();
  const md = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
  if (md) {
    const [head, ...rest] = md[1].split(/:\s+/);
    return { section: classifyHeader(head) ?? 'unknown', rest: rest.join(': ') };
  }
  const bold = /^(?:\*\*|__)([^*_]{2,80}?)(?::\s*)?(?:\*\*|__)\s*:?\s*(.*)$/.exec(line);
  if (bold && (classifyHeader(bold[1]) || (!bold[2] && bold[1].trim().split(/\s+/).length <= 6))) {
    return { section: classifyHeader(bold[1]) ?? 'unknown', rest: bold[2] };
  }
  if (bullet) return undefined;
  const colon = /^([^:]{2,60}?)\s*:\s*(.*)$/.exec(line.replace(/\*\*|__/g, ''));
  if (colon) {
    const section = classifyHeader(colon[1]);
    if (section) return { section, rest: colon[2] };
    const words = colon[1].trim().split(/\s+/).length;
    if (!colon[2] && words <= 6 && !['requirements', 'preferred', 'responsibilities'].includes(current)) {
      return { section: 'unknown', rest: '' };
    }
    return undefined;
  }
  const bare = classifyHeader(line);
  if (bare && !/[.,;]$/.test(line)) return { section: bare, rest: '' };
  return undefined;
}

// --- Sentences ----------------------------------------------------------------

const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'inc', 'ltd', 'co', 'corp', 'jr', 'sr', 'dr', 'mr', 'ms', 'mrs', 'st', 'no', 'approx', 'incl', 'dept', 'est',
]);

/**
 * Prose split into sentences at ". ", "! " or "? " before a capital, digit
 * or quote. Abbreviations ("e.g.", "etc.", "Inc.") and single initials
 * ("U.S.") don't end a sentence; "Node.js" never matches (no space).
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const boundary = /[.!?]+["”’)]?\s+(?=["“(]?[A-Z0-9])/g;
  for (let m = boundary.exec(text); m; m = boundary.exec(text)) {
    const before = text.slice(start, m.index);
    const lastWord = (/(\S+)$/.exec(before)?.[1] ?? '').toLowerCase().replace(/^[("“]+/, '');
    if (text[m.index] === '.' && (ABBREVIATIONS.has(lastWord) || /^(?:[a-z]\.)*[a-z]$/.test(lastWord))) continue;
    out.push(text.slice(start, m.index + m[0].trimEnd().length).trim());
    start = m.index + m[0].length;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

// --- Content overrides --------------------------------------------------------

/**
 * Boilerplate that is never a requirement wherever it sits: equal
 * opportunity statements, accommodation notices, and pay lines. These move
 * to `benefits`, so a JD without a Benefits header still can't turn
 * "$150,000–$180,000 + equity" into a requirement.
 */
export const BOILERPLATE =
  /\b(?:equal (?:employment )?opportunity|EEO|affirmative action|(?:regardless of|on the basis of) (?:race|gender|sex|age|religion|colou?r|national origin)|discriminat(?:e|ion) (?:on the basis|based on)|without regard to|reasonable accommodations?|protected (?:veteran|characteristic|status)|salary range|pay range|base (?:salary|pay)|compensation (?:range|package)|total compensation|401\s?\(?k\)?|health(?:,| and) dental|paid time off|parental leave|pay transparency|E-Verify|total rewards|cash compensation|equity grants?|restricted stock|on target earnings|(?:your |the )?(?:exact )?offer (?:may|will) vary)\b|^#[A-Za-z][\w-]*$|\$\s?\d{2,3}(?:,\d{3}|k)|\b(?:USD|EUR|GBP|CAD)\s?\d{2,3}(?:,\d{3}|k)/i;

/**
 * Where and on what terms the job is done, not a skill: office attendance,
 * relocation, work authorisation, clearance, background checks. The fit
 * checker can't judge them from work evidence, and a reader doesn't count
 * them as requirements of the craft, so they move to `benefits` like pay.
 */
export const LOGISTICS =
  /\b(?:(?:work|working|be|based) (?:in[- ]person|on[- ]?site|onsite)|in[- ]office|in the office|from (?:our|the) (?:[A-Z][\w.-]* ){0,3}office|(?:\d|one|two|three|four|five)(?:\+| or more)? days (?:a|per|each) week|relocat(?:e|ing|ion)|commut(?:e|ing|able)|(?:legally )?authori[sz]ed to work|work authori[sz]ation|(?:visa )?sponsorship|security clearance|(?:u\.?s\.?|uk|eu|canadian|american) citizen(?:ship)?|citizenship|lawful permanent resident|background check|drug (?:test|screen)(?:ing)?|time ?zones? overlap|overlap with (?:\w+ )?(?:business hours|time ?zones?))\b/i;

/** How to apply, not what to bring: "include a cover letter", "apply even if…". */
export const APPLICATION_NOTE =
  /\b(?:cover letter|(?:include|submit|attach|send)(?: us)?(?: a| an| your| any)? (?:resume|cv|portfolio|writing samples?|work samples?|links?|github)|in your application|when (?:you )?apply(?:ing)?|apply even if|(?:please |to )?apply (?:now|today|here|through|via)|check every box|meet every (?:single )?(?:requirement|qualification)|click (?:here|apply))\b/i;

/**
 * How pay is set ("pay depends on location", "salary is based on
 * level"): boilerplate that BOILERPLATE's amounts and ranges miss.
 */
export const PAY_NOTE =
  /\b(?:individual |base |starting )?(?:pay|salary|salaries|compensation)(?: ranges?| levels?| offers?)? (?:is |are |will be |may be |may )?(?:determined|based on|commensurate|varies|vary|depend(?:s|ent)? on)\b/i;

/**
 * A sentence that describes the person wanted, wherever it sits: "We're
 * looking for engineers who…", "We need someone who…", "You'll do
 * well here if you…", or a trait in the second person ("You have…", "You
 * are comfortable…", "You enjoy…"). Under a responsibilities header it is
 * still a requirement, so it moves to `requirements`. With no header it is
 * kept by `defaultDecision`, as a nice-to-have: without a header code
 * gives no must-haves (a headerless JD gets no coverage score).
 *
 * Not: "We're looking for a Senior Engineer to lead…" (the role, no "who"),
 * "You'll work with…" or "You build…" (duties), "The ideal candidate…"
 * (read as nice as often as must, so left to its section). Expects straight
 * apostrophes (see `straightQuotes`).
 */
export const REQUIREMENT_VOICE = new RegExp(
  [
    // "We're looking for engineers who", "we need folks who"
    "\\b(?:we're|we are) (?:looking for|seeking|searching for|hiring)\\s+(?:\\S+\\s+){0,4}?(?:engineers?|developers?|someone|people|folks|candidates?|individuals?|teammates?|builders?)\\s+who\\b",
    '\\bwe (?:need|want)\\s+(?:\\S+\\s+){0,3}?(?:engineers?|developers?|someone|people|folks|candidates?|individuals?|teammates?|builders?)\\s+who\\b',
    // "You'll do well here if you…"
    "\\byou(?:'ll| will| would| might| may)? (?:excel|thrive|succeed|do well|be successful)\\b[^.]{0,40}?\\bif you\\b",
    // A trait: second person, present tense, at the start. Not a duty or a
    // perk in the same words ("You are responsible for…", "You have the
    // opportunity to…").
    "^you (?:have|are|bring|know|enjoy|love|care|understand|possess|hold|thrive|take pride)\\b(?!\\s+(?:(?:the|full|end-to-end|direct|real)\\s+)?(?:responsib|accountab|in charge|expected|going to|able to work|ownership|opportunit|chance|freedom|autonomy|access|support|budget))",
  ].join('|'),
  'i',
);

/** Curly apostrophes straightened, for the patterns written with "'". */
export const straightQuotes = (text: string) => text.replace(/[‘’ʼ]/g, "'");

// --- Segmentation -------------------------------------------------------------

/**
 * The JD as items: one per bullet, one per line or wrapped paragraph of
 * prose, with the section each sits in. Headers set the section and produce
 * no item.
 */
function toItems(lines: readonly string[], skip: number | null): Item[] {
  const items: Item[] = [];
  let section: Section = 'unknown';
  let lastContentLine = -2;

  const push = (item: Item) => {
    items.push(item);
    lastContentLine = item.lastLine;
  };

  lines.forEach((raw, lineNo) => {
    if (lineNo === skip) return;
    if (!raw.trim() || RULE.test(raw)) return;
    const indent = indentOf(raw);

    // A flat pasted list: split it into pieces, the first keeps its own status.
    const pieces = raw.trim().split(INLINE_BULLET);
    pieces.forEach((piece, p) => {
      const marker = BULLET.exec(piece);
      const inlineBullet = p > 0;
      let bullet = inlineBullet || (!!marker && marker[0].length < piece.length);
      let body = bullet && marker ? piece.slice(marker[0].length) : piece;
      // "**Bold header**" on a bullet line, or "1. Requirements", is still a header.
      const header = matchHeader(bullet && marker && !inlineBullet ? body : piece, bullet && !/^\*\*|^__/.test(body), section);
      if (header) {
        section = header.section;
        if (!header.rest.trim()) {
          lastContentLine = -2;
          return;
        }
        body = header.rest;
        bullet = false;
      }
      const text = tidy(body);
      if (!text || !/[\p{L}\p{N}]/u.test(text)) return;

      const prev = items.at(-1);
      const adjacent = !!prev && lastContentLine === lineNo - 1 && prev.section === section && p === 0 && !header;
      if (prev && adjacent) {
        // A nested bullet under a lead-in ("Experience with one of:") joins it.
        if (bullet && prev.bullet && indent > prev.indent && (prev.parent || /:$/.test(prev.text))) {
          prev.text = `${prev.text}${prev.parent ? ',' : ''} ${text}`;
          prev.parent = true;
          prev.lastLine = lineNo;
          lastContentLine = lineNo;
          return;
        }
        // A hard-wrapped line continues the item above it.
        const firstWord = /^\S+/.exec(text)?.[0] ?? '';
        const wrapped =
          !bullet &&
          !prev.parent &&
          ((prev.bullet && indent > prev.indent) ||
            /^[a-z][a-z'-]*[,;:]?$/.test(firstWord) ||
            /^[(&]/.test(text) ||
            DANGLING.test(prev.text));
        if (wrapped) {
          prev.text = `${prev.text} ${text}`;
          prev.lastLine = lineNo;
          lastContentLine = lineNo;
          return;
        }
      }
      push({ text, section, bullet, indent, line: lineNo, lastLine: lineNo, parent: false });
    });
  });
  return items;
}

const GAP_LABEL: ReadonlyMap<string, string> = new Map(GAP_VOCABULARY.map((t) => [t.id, t.label]));

/** Code's findings for one piece of text. */
export function analyzeText(text: string, section: Section): Omit<Segment, 'index'> {
  const found = detectSkills(text);
  const effective: Section =
    section !== 'benefits' && [BOILERPLATE, LOGISTICS, APPLICATION_NOTE, PAY_NOTE].some((re) => re.test(text))
      ? 'benefits'
      : section === 'responsibilities' && REQUIREMENT_VOICE.test(straightQuotes(text))
        ? 'requirements'
        : section;
  const years = parseMinYears(text);
  return {
    text,
    section: effective,
    priority: segmentPriority(effective, text),
    skills: found.filter((f) => !f.gap).map((f) => f.id as CanonicalSkillId),
    otherSkills: found.filter((f) => f.gap).map((f) => GAP_LABEL.get(f.id)!),
    minYears: years !== null && yearsAreSoftware(text, found.length > 0) ? years : null,
  };
}

/** Order candidates are kept in when there are more than MAX_CANDIDATES. */
const CANDIDATE_TIER: Readonly<Record<Section, number>> = {
  requirements: 0,
  preferred: 0,
  unknown: 1,
  responsibilities: 2,
  about: 9,
  benefits: 9,
};

/**
 * The candidates the model is asked about: every segment outside about and
 * benefits, in order. Past MAX_CANDIDATES, requirements and preferred
 * segments are kept first, then unknown, then responsibilities; the kept
 * ones stay in document order.
 */
export function selectCandidates(segments: readonly Segment[]): number[] {
  const eligible = segments.filter((s) => CANDIDATE_TIER[s.section] < 9);
  const kept =
    eligible.length <= MAX_CANDIDATES
      ? eligible
      : [...eligible]
          .sort((a, b) => CANDIDATE_TIER[a.section] - CANDIDATE_TIER[b.section] || a.index - b.index)
          .slice(0, MAX_CANDIDATES);
  return kept.map((s) => s.index).sort((a, b) => a - b);
}

/**
 * Steps 1–6: segment, section and priority, skills, years, role, candidates.
 * Deterministic: the same JD gives the same `SegmentedJd` on every device.
 */
export function segmentJd(jd: string): SegmentedJd {
  const lines = jd
    .replace(/\r\n?/g, '\n')
    .replace(/[​‌⁠﻿]/g, '')
    .replace(/ /g, ' ')
    .split('\n');
  const { role, line } = findRole(lines);

  const segments: Segment[] = [];
  const prose = new Set<number>();
  for (const item of toItems(lines, line)) {
    // Bullets are one requirement each; prose is split into sentences.
    const bullet = item.bullet || item.parent;
    const texts = bullet ? [item.text] : splitSentences(item.text);
    for (const text of texts) {
      if (!bullet) prose.add(segments.length);
      segments.push({ index: segments.length, ...analyzeText(text, item.section) });
    }
  }
  markDuties(segments, prose);
  return { role, segments, candidates: selectCandidates(segments) };
}

/**
 * Duty lines a JD with a requirements list doesn't need as rows (sets
 * `duty`; `defaultDecision` then drops them):
 * - `summary`: a prose sentence under a responsibilities header, the role
 *   pitch ("Some weeks you'll tune queries, others…"), not a list item;
 * - `restated`: a duty whose every skill a requirements or preferred line
 *   already names ("Build pipelines with Kafka" beside "Experience with
 *   Kafka"), so its row would only repeat that verdict.
 * A JD without a requirements or preferred section keeps its duties: then
 * they are the only place its technology is named.
 */
function markDuties(segments: Segment[], prose: ReadonlySet<number>): void {
  const stated = segments.filter((s) => s.section === 'requirements' || s.section === 'preferred');
  if (stated.length === 0) return;
  const named = new Set(stated.flatMap((s) => [...s.skills, ...s.otherSkills]));
  for (const s of segments) {
    if (s.section !== 'responsibilities') continue;
    const skills = [...s.skills, ...s.otherSkills];
    if (prose.has(s.index)) s.duty = 'summary';
    else if (skills.length > 0 && skills.every((id) => named.has(id))) s.duty = 'restated';
  }
}
