import { GAP_VOCABULARY, gapTerm, normalizeSkill, SKILLS_TABLE } from '@/data/corpus/skills';
import { detectSkills } from '@/lib/fit/scan';

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
  { id: 'acs-microdialysis', names: ['microdialysis', 'his paper', 'the paper', 'publication', 'analytical chemistry paper'] },
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
  /\b(?:contact|e-?mail|reach (?:him|out)|get in touch|phone|call him|linkedin|github|resume|résumé|cv|available|availability|start date|when can he start|notice period|open to (?:new )?(?:roles?|work|opportunities|a role)|looking for (?:a )?(?:new )?(?:roles?|job|work)|job search|where is he|where does he live|based|located|location|relocat\w*|remote|on-?site|hybrid|visa|sponsorship|what roles?|which roles?|role targets?|salary)\b/i;

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
