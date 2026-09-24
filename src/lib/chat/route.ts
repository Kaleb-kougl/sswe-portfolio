import { GAP_VOCABULARY, gapTerm, normalizeSkill, SKILLS_TABLE } from '@/data/corpus/skills';
import { detectSkills } from '@/lib/fit/scan';

import { hasFigure, numberFamilies, type NumberFamily } from './figures';

/**
 * CHAT ROUTER (measurement spike, not wired into any page).
 *
 * Code decides which tool answers a visitor's message; the on-device model
 * only narrates that tool's output. Pure and synchronous: no model, no I/O.
 *
 * Precedence, first match wins:
 *   1. a pasted job description          → check_fit
 *   2. a named project, role or employer → get_project
 *   3. contact / availability / location → get_profile (even with a skill:
 *      "Is he available for a React role?" asks about availability)
 *   4. a named skill (canonical or gap)  → search_evidence { skills }
 *   5. an experience question, no skill  → search_evidence { query }
 *   6. "who is he", "tell me about him"  → get_profile
 *   7. anything else                     → none (a canned reply, no model)
 *
 * Gap-vocabulary terms route to search_evidence on purpose: "Kubernetes?"
 * returns no evidence, and the answer must say so.
 */

export type ChatToolName = 'check_fit' | 'search_evidence' | 'get_profile' | 'get_project';

export type ChatRoute =
  | { tool: 'check_fit'; input: { job_description: string }; reason: string }
  | {
      tool: 'search_evidence';
      input: { skills?: string[]; query?: string; limit?: number };
      /** Skills the visitor asked about: canonical ids, or gap-term labels. */
      asked: AskedSkill[];
      reason: string;
    }
  | { tool: 'get_profile'; input: Record<string, never>; reason: string }
  | { tool: 'get_project'; input: { id: string }; reason: string }
  | { tool: 'none'; input: null; reason: string };

export interface AskedSkill {
  /** Canonical skill id, or the gap term's id. */
  id: string;
  /** How it reads to a person ("Kubernetes", "React"). */
  label: string;
  /** In the gap vocabulary: the corpus claims nothing for it. */
  gap: boolean;
}

/** What the bot says, without a model, when nothing routes. */
export const CANNED_NONE =
  "I can answer questions about Kaleb Kougl's work from his portfolio: whether he has used a skill (e.g. \"Has he used React?\"), a project or role (e.g. \"Tell me about r3f-projectiles\"), how to contact him and his availability, or how he fits a job description you paste in.";

export const JD_MIN_CHARS = 400;
const MESSAGE_MAX_CHARS = 12_000;

// --------------------------------------------------------------- 1. JD

const JD_CUES =
  /\b(?:requirements?|qualifications?|responsibilities|what you(?:'|’)ll do|what we(?:'|’)re looking for|you will|you(?:'|’)ll|nice to have|preferred|must have|years of (?:professional )?experience|\d+\+? years|about the role|about you|benefits|we are looking for|we(?:'|’)re looking for|job description|compensation|salary range)\b/gi;
const BULLET_LINE = /^\s*(?:[-*•·▪◦●■►]|\d{1,2}[.)])\s+\S/;

/** A pasted posting: long, or several bullet lines plus requirement-like wording. */
export function looksLikeJd(message: string): boolean {
  const text = message.trim();
  const lines = text.split(/\n/).filter((l) => l.trim());
  const bullets = lines.filter((l) => BULLET_LINE.test(l)).length;
  const cues = new Set((text.match(JD_CUES) ?? []).map((c) => c.toLowerCase())).size;
  if (text.length >= 1_200) return true;
  if (text.length >= JD_MIN_CHARS && (cues >= 1 || bullets >= 3)) return true;
  // A short prose posting ("We're looking for … 5+ years … Nice to have: …").
  if (text.length >= 150 && cues >= 2 && !text.includes('?')) return true;
  return lines.length >= 5 && bullets >= 3 && cues >= 1;
}

// --------------------------------------------------------------- 2. projects

/**
 * Names a visitor might use for each project id (src/lib/tools/projects.ts).
 * An employer maps to the latest role there; a sub-project (OneHost) to the
 * role that holds it.
 */
export const PROJECT_ALIASES: readonly { id: string; names: readonly string[] }[] = [
  { id: 'r3f-projectiles', names: ['r3f-projectiles', 'r3f projectiles', 'projectile engine', 'bullet-hell engine', 'bullet hell engine', 'bullet-hell', 'bullet hell'] },
  { id: 'roblox-css', names: ['roblox-css', 'roblox css'] },
  { id: 'hammerball', names: ['bonkball', 'bonk ball', 'hammerball', 'roblox game'] },
  { id: 'video-pipeline', names: ['video-pipeline', 'video pipeline', 'video creator', 'agentic ai video creator'] },
  { id: 'analytics-extension', names: ['analytics extension', 'chrome extension project', 'indeed analytics extension'] },
  { id: 'acs-microdialysis', names: ['microdialysis', 'his paper', 'the paper', 'research paper', 'publication', 'analytical chemistry paper'] },
  { id: 'indeed-sr-swe', names: ['onehost', 'one host', 'indeed'] },
  { id: 'ibm-staff-swe', names: ['ibm'] },
  { id: 'jbhunt-intern', names: ['j.b. hunt', 'jb hunt', 'j b hunt', 'jbhunt', 'internship'] },
];

const PROJECT_CUE = /\b(?:tell me (?:more )?about|what (?:is|was|did)|describe|explain|walk me through|how does|how did|what's|details on|more about|at)\b/i;

function projectFor(message: string): { id: string; name: string } | null {
  const lower = message.toLowerCase();
  let best: { id: string; name: string; at: number } | null = null;
  for (const { id, names } of PROJECT_ALIASES) {
    for (const name of names) {
      const re = new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`);
      const m = re.exec(lower);
      if (m && (!best || m.index < best.at)) best = { id, name, at: m.index };
    }
  }
  return best && { id: best.id, name: best.name };
}

// --------------------------------------------------------------- 3. profile

const CONTACT_CUES =
  /\b(?:contact|e-?mail|reach (?:him|out)|get in touch|phone|call him|linkedin|github|resume|résumé|cv|available|availability|start date|when (?:can|could|would) he start|notice period|open to (?:new )?(?:roles?|work|opportunities|a role)|looking for (?:a )?(?:new )?(?:roles?|job|work)|job search|where is he|where does he live|(?:what|which) (?:city|state|country|area|town)|(?<![-\w])based|located|location|relocat\w*|remote|on-?site|hybrid|visa|sponsorship|what roles?|which roles?|role targets?|targeting|what (?:kind|sort|type) of (?:job|role|position|work)|salary)\b/i;

const ABOUT_CUES =
  /\b(?:who is (?:he|kaleb)|who's kaleb|tell me about (?:him|kaleb|yourself)|about kaleb|his background|summary|overview|introduce|what does (?:he|kaleb) do|current (?:title|role|job)|his title)\b/i;

// --------------------------------------------------------------- 4–5. skills

const LABELS = new Map(SKILLS_TABLE.map((s) => [s.id, s.label]));

/**
 * Bare words that are skills or aliases but, alone in a chat message, are
 * ordinary English ("three years", "in motion", "go to").
 */
const FALLBACK_STOP = new Set(['three', 'motion', 'fp', 'dx', 'di', 'go', 'three years', 'agents', 'apollo', 'ecs', 'node', 'research', 'api']);

/** detectSkills misses short questions ("How much Go?"), so also try 1–3 word runs. */
function ngramSkills(message: string): AskedSkill[] {
  const words = message.match(/[A-Za-z0-9.+#-]+/g) ?? [];
  const found: AskedSkill[] = [];
  const seen = new Set<string>();
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const raw = words.slice(i, i + n).join(' ').replace(/[.?!,]+$/, '');
      const lower = raw.toLowerCase();
      // "Go" only capitalised and not sentence-initial ("Go ahead").
      if (lower === 'go') {
        if (raw === 'Go' && i > 0) add({ id: 'go', label: 'Go', gap: true });
        continue;
      }
      if (FALLBACK_STOP.has(lower)) continue;
      const canonical = normalizeSkill(raw);
      if (canonical) add({ id: canonical, label: LABELS.get(canonical) ?? canonical, gap: false });
      else {
        const gap = gapTerm(raw);
        if (gap && raw.length > 1) add({ id: gap.id, label: gap.label, gap: true });
      }
    }
  }
  return found;
  function add(s: AskedSkill) {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    found.push(s);
  }
}

const GAP_LABEL = new Map(GAP_VOCABULARY.map((t) => [t.id, t.label]));

/** Skills a message names: the fit scan's matcher first, then n-gram lookup. */
export function skillsInMessage(message: string): AskedSkill[] {
  const out: AskedSkill[] = [];
  const seen = new Set<string>();
  for (const { id, gap } of detectSkills(message)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, gap, label: (gap ? GAP_LABEL.get(id) : LABELS.get(id)) ?? id });
  }
  for (const s of ngramSkills(message)) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

const EXPERIENCE_CUES =
  /\b(?:has he|have he|did he|does he|is he|was he|can he|could he|experience|worked|work on|built|build|led|lead|leadership|managed|manage|mentor\w*|team|shipped|ship|years|expert|proficient|familiar|skills?|strongest|strengths?|accomplish\w*|achievements?|impact|results?|numbers?|metrics?)\b/i;

/** Words that name a quality, not a thing to search for ("Is he good?"). */
const VAGUE_ONLY = /^(?:is|was|would|will|he|kaleb|kougl|good|great|any|a|the|fit|hire|worth|it|strong|smart|nice|decent|candidate|engineer|should|we|i|you|really|legit|real|ok|okay|at|all)$/i;

function searchableWords(message: string): string[] {
  return (message.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !VAGUE_ONLY.test(w));
}

// --------------------------------------------------------------- route

export function routeMessage(raw: string): ChatRoute {
  const message = raw.slice(0, MESSAGE_MAX_CHARS).trim();
  if (!message) return { tool: 'none', input: null, reason: 'empty' };

  if (looksLikeJd(message)) {
    return { tool: 'check_fit', input: { job_description: message }, reason: 'job description' };
  }

  const project = projectFor(message);
  const skills = skillsInMessage(message);
  // A named project wins, unless the message is about a skill "at" an employer
  // ("React at IBM?" is a skill question; "What did he do at IBM?" is not).
  const employerOnly = project && ['indeed-sr-swe', 'ibm-staff-swe', 'jbhunt-intern'].includes(project.id);
  if (project && !(employerOnly && skills.length > 0)) {
    if (!employerOnly || PROJECT_CUE.test(message) || message.split(/\s+/).length <= 4) {
      return { tool: 'get_project', input: { id: project.id }, reason: `names "${project.name}"` };
    }
  }

  // "Is he available for a React role?" is about availability, not React.
  if (CONTACT_CUES.test(message)) {
    return { tool: 'get_profile', input: {}, reason: 'contact / availability / location' };
  }

  if (skills.length > 0) {
    return {
      tool: 'search_evidence',
      input: { skills: skills.map((s) => (s.gap ? s.label : s.id)), limit: 4 },
      asked: skills,
      reason: `skills: ${skills.map((s) => s.label).join(', ')}`,
    };
  }

  if (ABOUT_CUES.test(message)) {
    return { tool: 'get_profile', input: {}, reason: 'about Kaleb' };
  }

  if (EXPERIENCE_CUES.test(message) && searchableWords(message).length >= 2) {
    return {
      tool: 'search_evidence',
      input: { query: message.slice(0, 500), limit: 4 },
      asked: [],
      reason: 'experience question without a named skill',
    };
  }

  return { tool: 'none', input: null, reason: 'no tool fits' };
}

// =============================================================== routeChat
//
// The router for the model-free chat on /fit (src/lib/chat/answer.ts). It
// builds on `routeMessage` above, which the on-device spike still uses
// unchanged, and adds what a chat with no model has to decide in code:
//
//   - injection attempts get the help reply (there is no model to obey
//     them, and answering their embedded question would look like obeying);
//   - "what has he built?" goes to list_projects;
//   - profile questions carry a topic, so the reply leads with the answer;
//   - typos ("typscript", "kubernets") and a few chat words ("tests") are
//     read as the skill they mean;
//   - a question that states a claim or a number ("He led a team of 10,
//     right?") is marked `leading`, so the reply quotes the evidence instead
//     of saying yes or no;
//   - a technology outside the vocabulary ("Haskell") is an `unknown-term`.
//
// Precedence, first match wins: empty → JD → injection → named project →
// project list → profile → skills → about → unknown term → experience
// question → help.

/** Aliases that name an employer, not a project: "React at IBM?" is a skill question. */
const EMPLOYER_NAMES = new Set(['indeed', 'ibm', 'j.b. hunt', 'jb hunt', 'j b hunt', 'jbhunt', 'internship']);

export type ProfileTopic = 'contact' | 'availability' | 'location' | 'roles' | 'about' | 'unstated';

/** Profile questions the profile has no answer for, and how the reply names them. */
export type UnstatedTopic = 'relocation' | 'remote' | 'visa' | 'salary' | 'phone';

export type ChatIntent =
  | { kind: 'help'; reason: 'empty' | 'injection' | 'no-match' }
  | { kind: 'fit'; jd: string }
  | { kind: 'projects' }
  | { kind: 'project'; id: string }
  | { kind: 'profile'; topic: ProfileTopic; unstated: UnstatedTopic | null }
  | { kind: 'skills'; asked: AskedSkill[]; leading: boolean; figures: Figures }
  | { kind: 'query'; query: string; leading: boolean; figures: Figures }
  | { kind: 'unknown-term'; term: string; leading: boolean; figures: Figures };

/**
 * A question that carries a figure: the families it is a figure of (see
 * figures.ts), possibly none. Null when the question states no number.
 */
export type Figures = NumberFamily[] | null;

/** The number families of a message's figures, or null when it has none. */
export function figuresOf(message: string): Figures {
  return hasFigure(message) ? numberFamilies(message) : null;
}

const INJECTION =
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.?!\n]{0,40}\b(?:rules?|instructions?|prompts?|guidelines|evidence|everything|above|previous|constraints|policy)\b|\bsystem\s*(?:override|prompt|message|:)|<\/?\s*(?:system|assistant|user)\s*>|\byou are now\b|\bfrom now on,? you\b|\bpretend (?:you(?:'|’)?re|you are|to be)\b|\bact as\b|\bjailbreak\b|\bDAN\b|\bdeveloper mode\b|\bnew instructions\b|\[\s*(?:system|admin|assistant)\s*\]|\brate (?:him|kaleb) \d|\b(?:reveal|print|show|repeat) (?:me )?(?:your|the) (?:system )?(?:prompt|instructions)\b|\b(?:say|tell me|write|state|claim|confirm) (?:that )?(?:he(?:'|’)s|he is|kaleb is|kaleb(?:'|’)s) (?:a |an |the )?(?:perfect|ideal|great|excellent|best|top|10x|genius|amazing)/;

/** A message that tries to instruct the bot rather than ask about Kaleb. */
export function isInjection(message: string): boolean {
  return INJECTION.test(message) || INJECTION.test(message.toLowerCase());
}

const PROJECT_LIST =
  /\b(?:projects|portfolio)\b|\b(?:list|show me|show)\s+(?:all\s+)?(?:of\s+)?(?:his\s+|the\s+)?(?:work|roles|jobs)\b|\bwhat (?:has|did|does) (?:he|kaleb) (?:built|build|made|make|worked on|work on|created|create)\b/i;

const UNSTATED: readonly [UnstatedTopic, RegExp][] = [
  ['relocation', /\brelocat\w*|\bmove to\b/i],
  ['remote', /\bremote\b|\bon-?site\b|\bhybrid\b|\bin[- ]office\b/i],
  ['visa', /\bvisa\b|\bsponsor\w*|\bwork authori[sz]ation\b|\bcitizen\w*/i],
  ['salary', /\bsalary\b|\bcompensation\b|\bpay\b|\brate\b|\bexpectations?\b/i],
  ['phone', /\bphone\b|\bcall him\b|\bnumber\b/i],
];

const TOPIC_CUES: readonly [Exclude<ProfileTopic, 'unstated' | 'about'>, RegExp][] = [
  ['roles', /\bwhat roles?\b|\bwhich roles?\b|\brole targets?\b|\btargeting\b|\bwhat (?:kind|sort|type) of (?:job|role|position|work)\b/i],
  ['availability', /\bavailab\w*|\bstart\b|\bnotice period\b|\bopen to\b|\blooking for\b|\bjob search\b/i],
  ['location', /\bwhere\b|(?<![-\w])based\b|\blocat\w*|\blive\b|\b(?:city|state|country|area|town)\b/i],
  ['contact', /./],
];

function profileTopic(message: string): { topic: ProfileTopic; unstated: UnstatedTopic | null } {
  for (const [topic, re] of UNSTATED) if (re.test(message)) return { topic: 'unstated', unstated: topic };
  for (const [topic, re] of TOPIC_CUES) if (re.test(message)) return { topic, unstated: null };
  return { topic: 'contact', unstated: null };
}

// --------------------------------------------------------------- claims

const NUMBER_WORD =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|dozen)\b/i;
const LEADING_CUE =
  /\b(?:right|correct|true|yes|confirm|isn(?:'|’)?t (?:he|it|that)|is that (?:so|true|right)|i (?:heard|read|was told)|so he|he(?:'|’)s (?:a|an)|he is (?:a|an)|he was (?:a|an))\b/i;

/**
 * A message that states something as fact, or carries a figure. The reply
 * then quotes the records instead of answering yes or no, and never repeats
 * the visitor's number.
 */
export function isLeading(message: string): boolean {
  return /\d/.test(message) || NUMBER_WORD.test(message) || LEADING_CUE.test(message);
}

/** The words of a leading question worth searching on: no figures, no "right?". */
export function claimFreeQuery(message: string): string {
  return message
    .replace(/[~≈$]?\d[\d,.]*\s*(?:%|x|k|m|mb|kb|gb|\+)?/gi, ' ')
    .replace(new RegExp(NUMBER_WORD.source, 'gi'), ' ')
    .replace(new RegExp(LEADING_CUE.source, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --------------------------------------------------------------- skills, forgiving

/** Chat words that mean a tag but aren't aliases in the corpus vocabulary. */
const CHAT_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ['tests', 'automated-testing'],
  ['test', 'automated-testing'],
  ['performance', 'web-performance'],
  ['accessible', 'wcag'],
]);

interface VocabTerm {
  key: string;
  skill: AskedSkill;
}

/** Single-word skill names (canonical and gap), for typo matching. */
const FUZZY_VOCAB: readonly VocabTerm[] = [
  ...SKILLS_TABLE.flatMap((s) =>
    [s.id, s.label, ...s.aliases].filter((t) => !/\s/.test(t)).map((t) => ({ key: t, skill: { id: s.id, label: s.label, gap: false } })),
  ),
  ...GAP_VOCABULARY.flatMap((g) =>
    [g.id, g.label, ...g.aliases].filter((t) => !/\s/.test(t)).map((t) => ({ key: t, skill: { id: g.id, label: g.label, gap: true } })),
  ),
]
  .map((v) => ({ ...v, key: v.key.toLowerCase().replace(/[^a-z0-9]+/g, '') }))
  .filter((v) => v.key.length >= 5);

/**
 * English words an edit or two from a skill name ("passing" → Parsers,
 * "objective" → Objective-C). A typo match never fires on these.
 */
const NOT_TYPOS = new Set([
  // Found by running every 6+ letter word in /usr/share/dict/words through
  // typoSkill and keeping the ones a recruiter might plausibly type.
  'agitation', 'annular', 'boundless', 'couching', 'crouching', 'flatter', 'flitter', 'fluster', 'objective', 'objectives',
  'objectively', 'paring', 'parking', 'passing', 'redact', 'resentful', 'scalar', 'sparks', 'sparky', 'tasting', 'unread',
  'unseal', 'decker', 'dicker', 'ducker', 'monitorship', 'pedantic', 'swifty', 'misrate',
]);

/** Damerau–Levenshtein distance (adjacent transpositions count once). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The skill a misspelt word most likely means, or null. */
export function typoSkill(word: string): AskedSkill | null {
  const w = word.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (w.length < 6 || NOT_TYPOS.has(w) || /\d/.test(w)) return null;
  const max = w.length >= 9 ? 2 : 1;
  let best: { skill: AskedSkill; d: number } | null = null;
  for (const v of FUZZY_VOCAB) {
    // People rarely mistype the first letter; most English near-misses differ there.
    if (v.key[0] !== w[0] || Math.abs(v.key.length - w.length) > max) continue;
    const d = editDistance(w, v.key);
    if (d === 0) return null; // an exact name: the plain matcher already had its chance
    if (d <= max && (!best || d < best.d)) best = { skill: v.skill, d };
  }
  return best?.skill ?? null;
}

/** Skills a chat message names: exact matches, chat synonyms, then typos. */
export function chatSkills(message: string): AskedSkill[] {
  const out = [...skillsInMessage(message)];
  const seen = new Set(out.map((s) => s.id));
  const add = (s: AskedSkill | null) => {
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  };
  for (const word of message.toLowerCase().match(/[a-z][a-z0-9.+#-]*/g) ?? []) {
    const bare = word.replace(/[.]+$/, '');
    const syn = CHAT_SYNONYMS.get(bare);
    if (syn) add({ id: syn, label: LABELS.get(syn) ?? syn, gap: false });
  }
  // Typos, on words no exact match already explains ("Typescirpt and Nodejs").
  const exactWords = new Set(out.flatMap((s) => s.label.toLowerCase().split(/[^a-z0-9]+/)));
  for (const word of message.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
    if (!exactWords.has(word.toLowerCase()) && normalizeSkill(word) === undefined) add(typoSkill(word));
  }
  return dropSubsumed(out, message);
}

/**
 * "React Native" names React Native, not React as well: a skill whose label
 * only ever appears inside another found skill's label is dropped.
 */
function dropSubsumed(skills: AskedSkill[], message: string): AskedSkill[] {
  const lower = message.toLowerCase();
  const count = (label: string) => lower.split(label.toLowerCase()).length - 1;
  return skills.filter((a) => {
    const inside = skills.filter((b) => b !== a && b.label.toLowerCase().includes(a.label.toLowerCase()));
    if (inside.length === 0) return true;
    return count(a.label) > inside.reduce((n, b) => n + count(b.label), 0);
  });
}

// --------------------------------------------------------------- unknown terms

/** "Does he know X", "experience with X", "X?" — the X, when it looks like a technology. */
const TERM_AFTER =
  /\b(?:know|knows|use|used|uses|using|experience (?:with|in)|experienced (?:with|in)|familiar with|worked with|work with|working with|written|write|writes|wrote|code in|coded in|coding in|proficient (?:in|with)|skilled (?:in|with)|expert in|good (?:at|with))\s+(?:any\s+|some\s+)?([A-Za-z][A-Za-z0-9.+#-]*)/i;

/** Words that fill the TERM_AFTER slot without naming a technology. */
const NOT_TERMS = new Set(
  'him it that this these those them anything something stuff any some the a an what which who how me you us our his her their other others people teams team code coding software computers technology tech tools frameworks languages language programming well much many by for to in on at as of with from into about over under before after during lots lot'.split(
    ' ',
  ),
);

/** Whole messages that are chat, not a one-word skill question. */
const CHAT_WORDS = new Set(
  'hi hello hey hiya yo thanks thank ty ok okay cool nice great yes no nope yep sure help why how what who when where test testing ping hmm lol bye goodbye start menu'.split(
    ' ',
  ),
);

function unknownTerm(message: string): string | null {
  const m = TERM_AFTER.exec(message) ?? /^(?:any|what about|how about)\s+([A-Za-z][A-Za-z0-9.+#-]*)\s*\??$/i.exec(message.trim());
  const bare = message.replace(/[?!.\s]+$/g, '').trim();
  const candidate = m?.[1] ?? (/^[A-Za-z][A-Za-z0-9.+#-]*$/.test(bare) ? bare : null);
  if (!candidate) return null;
  const term = candidate.replace(/[.,]+$/, '');
  if (term.length < 2 || NOT_TERMS.has(term.toLowerCase()) || CHAT_WORDS.has(term.toLowerCase())) return null;
  return term;
}

// --------------------------------------------------------------- routeChat

export function routeChat(raw: string): ChatIntent {
  const message = raw.slice(0, MESSAGE_MAX_CHARS).trim();
  if (!message) return { kind: 'help', reason: 'empty' };

  // A posting first: an injection line inside a JD is just another row.
  if (looksLikeJd(message)) return { kind: 'fit', jd: message };
  if (isInjection(message)) return { kind: 'help', reason: 'injection' };

  const leading = isLeading(message);
  const figures = figuresOf(message);
  const skills = chatSkills(message);
  const project = projectFor(message);
  const employerOnly = project && EMPLOYER_NAMES.has(project.name);
  if (project && !(employerOnly && skills.length > 0)) {
    if (!employerOnly || PROJECT_CUE.test(message) || message.split(/\s+/).length <= 4) {
      return { kind: 'project', id: project.id };
    }
  }

  if (skills.length === 0 && PROJECT_LIST.test(message)) return { kind: 'projects' };

  if (CONTACT_CUES.test(message)) return { kind: 'profile', ...profileTopic(message) };

  if (skills.length > 0) return { kind: 'skills', asked: skills, leading, figures };

  if (ABOUT_CUES.test(message)) return { kind: 'profile', topic: 'about', unstated: null };

  const term = unknownTerm(message);
  if (term) return { kind: 'unknown-term', term, leading, figures };

  const query = leading ? claimFreeQuery(message) : message;
  // A figure of a known kind needs only one word to search on ("20% faster?").
  const minWords = figures && figures.length > 0 ? 1 : 2;
  if ((EXPERIENCE_CUES.test(message) || leading) && searchableWords(query).length >= minWords) {
    return { kind: 'query', query: query.slice(0, 500), leading, figures };
  }

  return { kind: 'help', reason: 'no-match' };
}
