import type { Evidence } from '@/data/corpus';
import { RESUME_DATA } from '@/data/resumeData';

/**
 * QUALIFIERS: what a requirement asks for beyond its named skills.
 *
 * "Built payment APIs used by thousands of merchants" names one skill
 * (api-design), and the corpus has API work, so skills alone judge it
 * strong. But the row also asks for a domain (payments) and a scale
 * (thousands of merchants), and nothing cited shows either. The badge
 * would oversell even if the note were honest. Plan principle (Phase 2b):
 * understating beats overselling.
 *
 * So `judgeRequirement` reads the requirement's own text for qualifiers and
 * checks each against the evidence the row cites. An uncovered qualifier
 * caps `strong` at `partial` and the note names what's missing. This can
 * only lower a verdict, never raise one, so a hostile JD still can't talk
 * its way to a better badge: the worst it can do is understate itself.
 *
 * Four kinds, each a small generic lexicon (no company names, no phrases
 * lifted from any posting):
 *
 * - domain: an industry or problem space (payments, healthcare, ads, games…).
 *   Covered when a cited record's claim, skills, entry or metric names the
 *   domain or a listed synonym (ads ↔ "ad-campaign", games ↔ game-development).
 * - scale: a stated audience, traffic or data size ("thousands of merchants",
 *   "10M+ users", "billions of events", "petabyte") or a generic phrase
 *   ("at scale", "large-scale", "high-traffic"). Covered only by a cited
 *   record whose claim or metric states a number of a comparable kind, at
 *   least as large as any number the requirement states. See `ScaleKind`.
 * - setting: where the work happened. "in production" / "production
 *   systems" and "professional/industry experience" are covered by a record
 *   from employment (a work-history entry, or a project done at one of those
 *   employers); "startup", "B2B", "SaaS" only by a record that says so;
 *   "consumer-facing" by one that says consumer or states a user count.
 * - depth: "expert" (singular: "work with domain experts" is about other
 *   people), "expertise", "deep knowledge", "extensive experience" are
 *   covered by a record with a metric or a lead/architecture role; "led the
 *   design of", "architected" only by a lead/architecture role.
 *
 * Deliberately NOT qualifiers (too common in postings to mean anything, so
 * they would only add noise): "strong", "solid", "proficient", "hands-on",
 * "scalable" (a design goal, not a proven size), "high-performance", and
 * "production" used as a quality bar ("production-quality code",
 * "production-ready", "production-grade"). A requirement that says a
 * qualifier is not needed ("no prior fintech experience required") has
 * none detected.
 *
 * Pure and worker-safe: string matching over the requirement and corpus.
 */

export type QualifierKind = 'domain' | 'scale' | 'setting' | 'depth';

export interface Qualifier {
  kind: QualifierKind;
  /** Stable id, e.g. `domain:payments`, `scale:audience`, `setting:production`. */
  id: string;
  /** How the note names it when missing: domains join "Nothing for …". */
  label: string;
}

// --- Evidence facts -------------------------------------------------------

/** Everything a record says about itself, lowercased, for domain synonyms. */
function evidenceText(e: Evidence): string {
  return [e.claim, e.skills.join(' '), e.entry, e.metric ?? ''].join(' ').toLowerCase();
}

/**
 * Employers are the companies of work-history entries. A record is from
 * employment if its entry is a work entry or a project entry at one of
 * those companies (the analytics extension, built at Indeed). Personal
 * projects, published packages and research are not, even when public.
 */
const WORK_COMPANIES = new Set(
  Object.values(RESUME_DATA)
    .filter((e) => e.type === 'work' && e.company)
    .map((e) => e.company),
);

export function fromEmployment(e: Evidence): boolean {
  const entry = RESUME_DATA[e.entry];
  return !!entry && (entry.type === 'work' || (entry.type === 'project' && WORK_COMPANIES.has(entry.company)));
}

/** A lead or architecture role: tagged tech-leadership or system-design, or the claim says led/architected. */
export function showsLeadership(e: Evidence): boolean {
  return (
    e.skills.includes('tech-leadership') ||
    e.skills.includes('system-design') ||
    /\b(?:led|lead|co-architected|architected)\b/i.test(e.claim)
  );
}

// --- Domains --------------------------------------------------------------

interface DomainRule {
  id: string;
  label: string;
  /** In the requirement text. */
  ask: RegExp;
  /** In a cited record (claim, skills, entry, metric). */
  shows: RegExp;
}

/**
 * Industries and problem spaces. The `ask` patterns avoid words postings use
 * for other things: bare "education" (degree lines), bare "programmatic"
 * (programmatic access), "game-changer", "accounting for".
 */
export const DOMAINS: readonly DomainRule[] = [
  {
    id: 'payments',
    label: 'payments',
    ask: /\bpayments?\b|\bbilling\b|\bcheckout\b/,
    shows: /\bpayments?\b|\bbilling\b|\bcheckout\b/,
  },
  {
    id: 'fintech',
    label: 'fintech',
    ask: /\bfin-?tech\b|\bfinancial (?:services|institutions?|products?|systems?|data)\b|\bbank(?:s|ing)?\b|\bcapital markets?\b|\btrading (?:systems?|platforms?|desks?)\b|\blending\b|\bwealth management\b/,
    shows: /\bfin(?:ance|ancial|tech)\b|\bbank(?:s|ing)?\b|\btrading\b|\blending\b/,
  },
  {
    id: 'fraud',
    label: 'fraud prevention',
    ask: /\b(?:anti-?)?fraud\b|\btrust (?:and|&) safety\b|\brisk (?:scoring|models?|decisioning)\b/,
    shows: /\bfraud\b|\btrust (?:and|&) safety\b/,
  },
  { id: 'insurance', label: 'insurance', ask: /\binsur(?:ance|tech)\b/, shows: /\binsur(?:ance|tech)\b/ },
  {
    id: 'healthcare',
    label: 'healthcare',
    ask: /\bhealth ?(?:care|tech)\b|\bclinical\b|\bmedical\b|\bpatients?\b|\behr\b|\bemr\b|\bhipaa\b|\bhospitals?\b|\bpharma(?:ceutical)?s?\b/,
    shows: /\bhealth ?(?:care|tech)\b|\bclinical\b|\bmedical\b|\bpatients?\b|\bhipaa\b|\bhospitals?\b|\bpharma/,
  },
  {
    id: 'life-sciences',
    label: 'life sciences',
    ask: /\blife sciences?\b|\bbiotech\b|\bbioinformatics\b|\bgenomics\b|\bchemistry\b/,
    shows: /\blife sciences?\b|\bbiotech\b|\bchemistry\b|\bbiofilm/,
  },
  {
    id: 'ads',
    label: 'ads',
    ask: /\bads\b|\badvertis(?:ing|ers?)\b|\bad ?tech\b|\bad[- ](?:campaigns?|platforms?|serving|auctions?|products?|targeting)\b|\bprogrammatic (?:advertising|ads|buying)\b|\bmar-?tech\b/,
    shows: /\bad[- ]campaigns?\b|\badvertis|\bads\b/,
  },
  {
    id: 'games',
    label: 'games',
    ask: /\bgam(?:es|ing)\b|\bgame ?(?:studios?|industry|development|developers?|engines?|design|servers?|dev)\b|\besports\b/,
    shows: /\bgames?\b|\bgaming\b|\bgame-development\b|\broblox\b/,
  },
  {
    id: 'ecommerce',
    label: 'e-commerce',
    ask: /\be-?commerce\b|\bretail\b|\bonline (?:store|shopping)\b|\bmarketplaces?\b/,
    shows: /\be-?commerce\b|\bretail\b|\bmarketplaces?\b/,
  },
  {
    id: 'education',
    label: 'education',
    ask: /\bed-?tech\b|\be-?learning\b|\beducation (?:technology|platforms?|products?|sector|industry)\b|\bk-?12\b/,
    shows: /\bed-?tech\b|\beducation\b|\be-?learning\b/,
  },
  {
    id: 'crypto',
    label: 'crypto',
    ask: /\bcrypto(?:currenc(?:y|ies))?\b|\bblockchain\b|\bweb3\b|\bdefi\b|\bsmart contracts?\b/,
    shows: /\bcrypto\b|\bblockchain\b|\bweb3\b/,
  },
  {
    id: 'government',
    label: 'government',
    ask: /\bgovernment\b|\bpublic sector\b|\bgov ?tech\b|\bdefen[cs]e (?:industry|sector|contractors?)\b/,
    shows: /\bgovernment\b|\bpublic sector\b/,
  },
  {
    id: 'logistics',
    label: 'logistics',
    ask: /\blogistics\b|\bsupply[- ]chain\b|\bfreight\b|\bfleet management\b/,
    shows: /\blogistics\b|\bsupply[- ]chain\b|\bfreight\b/,
  },
  { id: 'automotive', label: 'automotive', ask: /\bautomotive\b|\bautonomous (?:vehicles?|driving)\b/, shows: /\bautomotive\b|\bvehicles?\b/ },
  { id: 'telecom', label: 'telecom', ask: /\btelecom(?:munications)?\b/, shows: /\btelecom/ },
  {
    id: 'media',
    label: 'streaming media',
    // Not "streaming platform": event streaming (Kafka) is a skill, not media.
    ask: /\b(?:video|media|music) streaming\b|\bstreaming (?:media|video|music)\b|\bbroadcast(?:ing)?\b|\bmedia (?:industry|compan(?:y|ies))\b/,
    shows: /\bvideo\b|\bmedia\b|\bbroadcast/,
  },
  {
    id: 'cybersecurity',
    label: 'cybersecurity',
    ask: /\bcyber-?security\b|\binfosec\b|\bsecurity (?:products?|industry|compan(?:y|ies)|vendors?)\b|\bthreat (?:detection|intelligence)\b/,
    shows: /\bcyber|\binfosec\b|\bthreat\b/,
  },
];

// --- Scale ----------------------------------------------------------------

/**
 * Kinds of size a record can state. A requirement's scale is covered only
 * by the same kind: 680M+ users covers "millions of users" but not
 * "billions of requests" or "petabytes" (the record doesn't state those).
 * `org` (engineers, teams, components, services) covers a generic "at
 * scale" / "large-scale" only when the requirement is about code or
 * people ("a large-scale codebase migration"), never a system's load.
 */
export type ScaleKind = 'audience' | 'traffic' | 'data' | 'org';

// Not "people", "members" or "accounts": "a team of 5 people", "team
// members" and "key accounts" are headcount or sales, not an audience.
const AUDIENCE = 'users|customers|merchants|players|visitors|subscribers|clients|sellers|advertisers|businesses|job seekers|employers|dau|mau';
const TRAFFIC = 'requests|queries|qps|rps|tps|transactions|events|messages|calls|page ?views|sessions|orders|payments';
const DATA = 'tb|pb|eb|terabytes?|petabytes?|exabytes?|rows|records|documents|data points';
const ORG = 'teams|engineers|developers|components|services|micro-?frontends|packages|repos|repositories';
const NOUNS: Record<ScaleKind, string> = { audience: AUDIENCE, traffic: TRAFFIC, data: DATA, org: ORG };

/** A figure: "680M+", "20,000", "10 million", "500k". */
const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion|trillion)?\+?`;
/** "thousands of", "tens of millions of", "hundreds of thousands of". */
const MAGNITUDE_WORDS = String.raw`((?:tens|hundreds) of )?(thousands|millions|billions|trillions) of`;
/** Up to two words between the size and its noun: "10M monthly active users". */
const GAP = String.raw`(?:[\w-]+\s+){0,2}?`;

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9, trillion: 1e12 };
const WORD_UNIT: Record<string, number> = { thousands: 1e3, millions: 1e6, billions: 1e9, trillions: 1e12 };

function figure(digits: string, unit: string | undefined): number {
  return Number(digits.replace(/,/g, '')) * (unit ? UNIT[unit] : 1);
}

/** Every stated size in `text`, by kind. */
export function statedSizes(text: string): { kind: ScaleKind; size: number }[] {
  const lower = text.toLowerCase();
  const found: { kind: ScaleKind; size: number }[] = [];
  for (const kind of Object.keys(NOUNS) as ScaleKind[]) {
    const noun = `(?:${NOUNS[kind]})\\b`;
    for (const m of lower.matchAll(new RegExp(`\\b${NUMBER}\\s+${GAP}${noun}`, 'g'))) {
      found.push({ kind, size: figure(m[1], m[2]) });
    }
    for (const m of lower.matchAll(new RegExp(`\\b${MAGNITUDE_WORDS}\\s+${GAP}${noun}`, 'g'))) {
      found.push({ kind, size: WORD_UNIT[m[2]] * (m[1] ? (m[1].startsWith('tens') ? 10 : 100) : 1) });
    }
    if (kind === 'org') {
      for (const m of lower.matchAll(new RegExp(`\\bteam of ${NUMBER}`, 'g'))) found.push({ kind, size: figure(m[1], m[2]) });
    }
    if (kind === 'data') {
      for (const m of lower.matchAll(new RegExp(`\\b${NUMBER}\\s*(tb|pb|eb)\\b`, 'g'))) found.push({ kind, size: figure(m[1], m[2]) });
    }
  }
  return found;
}

interface ScaleNeed {
  kinds: readonly ScaleKind[];
  /** The size asked, when a number was stated; 0 for "at scale". */
  size: number;
}

/** Code or people, not a system's load: lets `org` sizes cover a generic scale phrase. */
const ORG_CONTEXT = /\b(?:codebases?|monorepos?|migrations?|refactors?|refactoring|components?|design systems?|teams|engineers|organi[sz]ations?|org)\b/;

const GENERIC_SCALE: readonly { pattern: RegExp; kinds: readonly ScaleKind[] }[] = [
  // "drawings at scale 1:50", "models at scale" are about proportion, not size.
  { pattern: /\bat (?:massive |global |internet |web )?scale\b(?!\s*(?:\d|of\b|models?\b|drawings?\b))/, kinds: ['audience', 'traffic', 'data'] },
  { pattern: /\b(?:large|massive|web|internet|planet|global|hyper|enterprise)[- ]scale\b|\bhyperscale\b/, kinds: ['audience', 'traffic', 'data'] },
  { pattern: /\bhigh[- ]traffic\b/, kinds: ['audience', 'traffic'] },
  { pattern: /\bhigh[- ](?:volume|throughput)\b/, kinds: ['traffic', 'data'] },
  { pattern: /\b(?:peta|tera|exa)bytes?\b|\b(?:peta|tera)byte[- ]scale\b/, kinds: ['data'] },
];

function scaleNeeds(lower: string): ScaleNeed[] {
  const needs: ScaleNeed[] = statedSizes(lower)
    .filter((s) => s.kind !== 'org')
    .map((s) => ({ kinds: [s.kind], size: s.size }));
  // "millions of <anything else>" is still a size, of an unstated kind.
  for (const m of lower.matchAll(new RegExp(`\\b${MAGNITUDE_WORDS}\\b`, 'g'))) {
    const size = WORD_UNIT[m[2]] * (m[1] ? (m[1].startsWith('tens') ? 10 : 100) : 1);
    if (!needs.some((n) => n.size === size)) needs.push({ kinds: ['audience', 'traffic', 'data'], size });
  }
  for (const { pattern, kinds } of GENERIC_SCALE) {
    if (pattern.test(lower)) {
      needs.push({ kinds: kinds.length === 3 && ORG_CONTEXT.test(lower) ? [...kinds, 'org'] : kinds, size: 0 });
    }
  }
  return needs;
}

function scaleCovered(need: ScaleNeed, pool: readonly Evidence[]): boolean {
  return pool.some((e) =>
    statedSizes(`${e.claim} ${e.metric ?? ''}`).some((s) => need.kinds.includes(s.kind) && s.size >= need.size),
  );
}

// --- Settings and depth ---------------------------------------------------

interface Rule {
  id: string;
  kind: 'setting' | 'depth';
  label: string;
  ask: RegExp;
  covered: (pool: readonly Evidence[]) => boolean;
}

const says = (pattern: RegExp) => (pool: readonly Evidence[]) => pool.some((e) => pattern.test(evidenceText(e)));

/**
 * "production" is a setting when it names where the work ran ("in
 * production", "production systems", "production React applications"),
 * not when it's a quality bar ("production-quality code", "production-
 * ready"): the second is about craft, which the skill evidence speaks to.
 */
const PRODUCTION =
  /\b(?:in|into|to) production\b(?![- ](?:quality|ready|grade|level)\b)|\bproduction(?![- ](?:quality|ready|grade|level)\b)(?:\s+[\w.+#/-]+){0,3}?\s+(?:systems?|services?|applications?|apps|environments?|software|traffic|workloads?|deployments?|infrastructure|features?|models?|pipelines?)\b/;

export const RULES: readonly Rule[] = [
  { id: 'production', kind: 'setting', label: 'production work', ask: PRODUCTION, covered: (pool) => pool.some(fromEmployment) },
  {
    id: 'professional',
    kind: 'setting',
    label: 'professional work',
    ask: /\b(?:professional|commercial|industry) experience\b|\bexperience in the [\w -]{1,30}? industry\b/,
    covered: (pool) => pool.some(fromEmployment),
  },
  {
    id: 'startup',
    kind: 'setting',
    label: 'startups',
    ask: /\b(?:early|seed)[- ]stage\b|\bstart-?ups?\b(?![- ]?(?:time|latency|scripts?|performance)\b)|\bseries [a-d] (?:company|startup)\b/,
    covered: says(/\bstart-?ups?\b|\bearly[- ]stage\b/),
  },
  { id: 'b2b', kind: 'setting', label: 'B2B', ask: /\bb2b\b|\benterprise (?:customers|clients|software|sales)\b/, covered: says(/\bb2b\b|\benterprise (?:customers|clients|software)\b/) },
  { id: 'saas', kind: 'setting', label: 'SaaS', ask: /\bsaas\b/, covered: says(/\bsaas\b/) },
  {
    id: 'consumer',
    kind: 'setting',
    label: 'consumer products',
    ask: /\bb2c\b|\bconsumer[- ](?:facing|products?|apps?|applications?|web|internet)\b/,
    covered: (pool) =>
      says(/\bconsumer\b|\bb2c\b/)(pool) || pool.some((e) => statedSizes(`${e.claim} ${e.metric ?? ''}`).some((s) => s.kind === 'audience')),
  },
  {
    id: 'expert',
    kind: 'depth',
    label: 'expert depth',
    ask: /\bexpert\b|\bexpertise\b|\bdeep (?:knowledge|understanding|expertise|experience|familiarity)\b|\bin-?depth (?:knowledge|understanding|experience)\b|\bmastery\b|\bextensive (?:experience|knowledge|background)\b|\badvanced (?:knowledge|understanding)\b/,
    covered: (pool) => pool.some((e) => !!e.metric || showsLeadership(e)),
  },
  {
    id: 'lead',
    kind: 'depth',
    label: 'a lead role',
    ask: /\bled the (?:design|architecture|development)\b|\blead(?:ing)? the (?:design|architecture)\b|\barchitect(?:ed|ing)\b|\b(?:design|build) and architect\b|\barchitect and (?:design|build)\b|\bowned the (?:design|architecture)\b/,
    covered: (pool) => pool.some(showsLeadership),
  },
];

/** Missing-qualifier sentences for the note, beyond "Nothing for <domain>". */
const MISSING: Record<string, string> = {
  scale: 'No evidence at that scale.',
  production: 'None of it from a job in production.',
  professional: 'None of it from a job.',
  startup: 'Nothing at a startup.',
  b2b: 'Nothing for B2B.',
  saas: 'Nothing for SaaS.',
  consumer: 'Nothing consumer-facing.',
  expert: 'No metric or lead role to back the depth asked.',
  lead: 'No lead or architecture role for this.',
};

/** "no prior fintech experience required": the posting waives it, so nothing is asked. */
const WAIVED = /\bnot (?:required|necessary|needed|a requirement)\b|\bno prior\b|\b(?:do not|don't|doesn't|does not) need\b|\bisn't required\b/;

// --- API ------------------------------------------------------------------

interface Detected extends Qualifier {
  covered: (pool: readonly Evidence[]) => boolean;
}

function detect(text: string): Detected[] {
  const lower = text.toLowerCase();
  if (WAIVED.test(lower)) return [];
  const out: Detected[] = [];
  for (const d of DOMAINS) {
    if (!d.ask.test(lower)) continue;
    out.push({ kind: 'domain', id: `domain:${d.id}`, label: d.label, covered: (pool) => pool.some((e) => d.shows.test(evidenceText(e))) });
  }
  scaleNeeds(lower).forEach((need, i) => {
    out.push({
      kind: 'scale',
      id: `scale:${need.kinds.join('+')}:${need.size}:${i}`,
      label: 'that scale',
      covered: (pool) => scaleCovered(need, pool),
    });
  });
  for (const r of RULES) {
    if (r.ask.test(lower)) out.push({ kind: r.kind, id: `${r.kind}:${r.id}`, label: r.label, covered: r.covered });
  }
  return out;
}

/** The qualifiers a requirement's text names, in lexicon order. */
export function detectQualifiers(text: string): Qualifier[] {
  return detect(text).map(({ kind, id, label }) => ({ kind, id, label }));
}

/** The qualifiers `text` names that no record in `pool` covers. */
export function uncoveredQualifiers(text: string, pool: readonly Evidence[]): Qualifier[] {
  return detect(text)
    .filter((q) => !q.covered(pool))
    .map(({ kind, id, label }) => ({ kind, id, label }));
}

/**
 * How the note says what's missing: domain labels join the row's existing
 * "Nothing for …" list; everything else is one short sentence each, scale
 * once however many sizes were asked.
 */
export function missingParts(uncovered: readonly Qualifier[]): { nothingFor: string[]; sentences: string[] } {
  const nothingFor = uncovered.filter((q) => q.kind === 'domain').map((q) => q.label);
  const sentences: string[] = [];
  for (const q of uncovered) {
    if (q.kind === 'domain') continue;
    const sentence = MISSING[q.kind === 'scale' ? 'scale' : q.id.split(':')[1]];
    if (sentence && !sentences.includes(sentence)) sentences.push(sentence);
  }
  return { nothingFor, sentences };
}
