import { CORPUS, normalizeSkill, skillKey, type Corpus, type Evidence } from '@/data/corpus';
import { SKILL_CATEGORIES, SKILL_CATEGORY, gapTerm, type SkillCategory } from '@/data/corpus/skills';
import { CAREER_START_YEAR, RESUME_DATA } from '@/data/resumeData';

import {
  CanonicalSkillId,
  Extraction,
  ExtractedRequirement,
  MAX_REQUIREMENTS,
  type FitReport,
  type Requirement,
  type Verdict,
} from './contract';
import { entryLabel, evidenceLabel } from './labels';
import { missingParts, uncoveredQualifiers } from './qualifiers';

/**
 * DETERMINISTIC JUDGING — Phase 2b of docs/plans/2026-09-23-ai-features.md.
 *
 * The model's output is a list of requirements and the skill tags they name.
 * Everything a visitor reads as a judgement — verdict, evidence, note,
 * coverage — is computed here from the corpus. Nothing here reads the job
 * description beyond each requirement's own text, and that text is only
 * checked for qualifiers (`qualifiers.ts`), which can lower a verdict but
 * never raise one; the worst a hostile JD can do is change what gets
 * extracted, or understate itself.
 *
 * Pure and deterministic: the only clock is the `now` argument.
 */

export const MAX_EVIDENCE = 3;
export const NOTE_MAX_CHARS = 200;
const OTHER_SKILL_MAX_CHARS = 40;
const MAX_SKILLS = 6;
const TEXT_MAX_CHARS = 200;
const ROLE_MAX_CHARS = 120;
/** For an extraction whose role came back blank. Says so rather than guessing. */
export const ROLE_FALLBACK = 'Role not stated';

export const NOT_ASSESSED_NOTE = 'Not something my portfolio shows either way.';
export const GAP_NOTE = 'Not in my work yet.';

// --- Input hygiene --------------------------------------------------------

/**
 * Coerce one extracted requirement into the contract, defensively.
 *
 * Constrained decoding should already guarantee the shape, but the judge
 * doesn't trust it: unknown skill ids are dropped (never guessed at), an
 * `otherSkills` entry that is really a canonical skill ("React") is moved to
 * `skills` so it can find its evidence, duplicates are removed and lengths
 * are clipped. Anything still wrong (a missing field, a wrong type) throws a
 * ZodError, because a malformed row is a bug to surface, not to paper over.
 */
export function sanitizeRequirement(raw: ExtractedRequirement): ExtractedRequirement {
  const skills: string[] = [];
  const addSkill = (id: string) => {
    if (!skills.includes(id) && CanonicalSkillId.safeParse(id).success) skills.push(id);
  };
  for (const id of Array.isArray(raw?.skills) ? raw.skills : []) {
    if (typeof id === 'string') addSkill(id);
  }

  const otherSkills: string[] = [];
  const otherKeys = new Set<string>();
  for (const name of Array.isArray(raw?.otherSkills) ? raw.otherSkills : []) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim().slice(0, OTHER_SKILL_MAX_CHARS);
    if (!trimmed) continue;
    const canonical = normalizeSkill(trimmed);
    if (canonical) {
      addSkill(canonical);
      continue;
    }
    // Spellings of one gap term ("Go", "golang") are one skill. "C++" and
    // "C#" share the skillKey "c", so unknown names compare case-folded.
    const key = skillKey(trimmed);
    const dedupeKey = gapTerm(trimmed)?.id ?? (key.length > 1 ? key : trimmed.toLowerCase());
    if (otherKeys.has(dedupeKey)) continue;
    otherKeys.add(dedupeKey);
    otherSkills.push(trimmed);
  }

  return ExtractedRequirement.parse({
    text: typeof raw?.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX_CHARS) : raw?.text,
    priority: raw?.priority,
    skills: skills.slice(0, MAX_SKILLS),
    otherSkills: otherSkills.slice(0, MAX_SKILLS),
    minYears: normalizeYears(raw?.minYears),
  });
}

/** "3.5 years" rounds up (the stricter reading); out-of-range values clamp. */
function normalizeYears(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.min(30, Math.max(0, Math.ceil(value)));
}

/** Two requirements are the same if they'd judge the same and read the same. */
function requirementKey(req: ExtractedRequirement): string {
  return JSON.stringify([
    skillKey(req.text),
    [...req.skills].sort(),
    req.otherSkills.map((s) => gapTerm(s)?.id ?? s.toLowerCase()).sort(),
    req.minYears,
  ]);
}

/**
 * Validate, clean and dedupe a whole extraction. Duplicates keep the first
 * occurrence's position; if any copy is a must-have, the kept one is too
 * (dropping a must-have would shrink the coverage denominator).
 *
 * The worker calls this once, then `judgeRequirement` per row, then
 * `coverageOf` — which is exactly what `judge` does.
 */
export function prepareExtraction(raw: Extraction): Extraction {
  const role =
    typeof raw?.role === 'string'
      ? raw.role.replace(/\s+/g, ' ').trim().slice(0, ROLE_MAX_CHARS) || ROLE_FALLBACK
      : raw?.role;
  const rows = Array.isArray(raw?.requirements) ? raw.requirements.slice(0, MAX_REQUIREMENTS) : raw?.requirements;
  const kept: ExtractedRequirement[] = [];
  const index = new Map<string, number>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const req = sanitizeRequirement(row);
    const key = requirementKey(req);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, kept.length);
      kept.push(req);
    } else if (req.priority === 'must') {
      kept[at] = { ...kept[at], priority: 'must' };
    }
  }
  return Extraction.parse({ role, requirements: Array.isArray(rows) ? kept : rows });
}

// --- Evidence ---------------------------------------------------------------

/**
 * Records sharing any of `skills`, best first: more shared skills, then
 * records with a metric, then corpus order (so ties never reorder between
 * runs). Returns every match.
 */
export function rankEvidence(skills: readonly string[], corpus: Corpus = CORPUS): Evidence[] {
  if (skills.length === 0) return [];
  const wanted = new Set(skills);
  return corpus.evidence
    .map((evidence, order) => ({
      evidence,
      order,
      overlap: evidence.skills.filter((s) => wanted.has(s)).length,
      metric: evidence.metric ? 1 : 0,
    }))
    .filter((r) => r.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.metric - a.metric || a.order - b.order)
    .map((r) => r.evidence);
}

/**
 * The (at most three) records a row cites. Every named skill that has a
 * record gets one in the list when there's room, so "Node.js and TypeScript"
 * shows the Node.js record rather than two TypeScript ones.
 *
 * Greedy: each pick is the record covering the most still-unrepresented
 * skills, ties going to `rankEvidence` order (more named skills overall,
 * then a metric, then corpus order). Once every covered skill is
 * represented, the remaining slots follow `rankEvidence` order.
 */
export function selectEvidence(skills: readonly string[], corpus: Corpus = CORPUS): Evidence[] {
  const ranked = rankEvidence(skills, corpus);
  const picked: Evidence[] = [];
  const unrepresented = new Set(skills.filter((s) => ranked.some((e) => e.skills.includes(s))));
  while (picked.length < MAX_EVIDENCE && unrepresented.size > 0) {
    let best: Evidence | undefined;
    let bestGain = 0;
    for (const e of ranked) {
      if (picked.includes(e)) continue;
      const gain = e.skills.filter((s) => unrepresented.has(s)).length;
      if (gain > bestGain) {
        best = e;
        bestGain = gain;
      }
    }
    if (!best) break;
    picked.push(best);
    best.skills.forEach((s) => unrepresented.delete(s));
  }
  for (const e of ranked) {
    if (picked.length >= MAX_EVIDENCE) break;
    if (!picked.includes(e)) picked.push(e);
  }
  return picked;
}

/** The evidence bar for "strong": ≥ 2 distinct records, or 1 with a metric. */
export function meetsStrongBar(matches: readonly Evidence[]): boolean {
  return matches.length >= 2 || matches.some((m) => m.metric);
}

export interface SkillAssessment {
  verdict: Exclude<Verdict, 'not_assessed'>;
  /** Every record sharing a named canonical skill, ranked. */
  matches: Evidence[];
  /** Named skills with no record, as display names, in the order named. */
  uncovered: string[];
}

/**
 * Per-skill coverage. A requirement's named skills are `skills` ∪
 * `otherSkills`; `otherSkills` are outside the vocabulary, so they never
 * have a record.
 *
 * - strong: every named skill has a record, and the records together meet
 *   the strong bar (`meetsStrongBar`).
 * - partial: some named skill has a record, but not strong — including when
 *   other named skills have none.
 * - gap: no named skill has a record.
 *
 * "X or Y" requirements are understated by this ("React or Vue" is partial,
 * because Vue has no record). The extraction doesn't carry and/or, and
 * reading every list as "and" can only understate; reading it as "or" would
 * let one matched skill vouch for skills with no evidence. Understating is
 * the acceptable failure.
 */
export function assessSkills(
  req: Pick<ExtractedRequirement, 'skills' | 'otherSkills'>,
  corpus: Corpus = CORPUS,
): SkillAssessment {
  const labels = new Map(corpus.skills.map((s) => [s.id, s.label]));
  const matches = rankEvidence(req.skills, corpus);
  const uncovered = [
    ...req.skills.filter((s) => !matches.some((e) => e.skills.includes(s))).map((s) => labels.get(s) ?? s),
    ...req.otherSkills,
  ];
  const verdict =
    matches.length === 0 ? 'gap' : uncovered.length === 0 && meetsStrongBar(matches) ? 'strong' : 'partial';
  return { verdict, matches, uncovered };
}

// --- Years ----------------------------------------------------------------

/**
 * Whole years in the industry, counted from the start of CAREER_START_YEAR:
 * the calendar-year difference. UTC, so the answer doesn't depend on the
 * visitor's time zone on New Year's Eve.
 */
export function careerYears(now: Date = new Date()): number {
  return Math.max(0, now.getUTCFullYear() - CAREER_START_YEAR);
}

/**
 * Whether the first year counted was an internship, so the note can say so.
 * Read from the work history rather than hard-coded, so it can't go stale.
 */
const STARTED_AS_INTERN = Object.values(RESUME_DATA).some(
  (e) => e.type === 'work' && /\bintern\b/i.test(e.title) && e.dates.includes(String(CAREER_START_YEAR)),
);

/**
 * The years arithmetic, stated either way, with "since <year>" and the
 * internship named so the count is transparent. A requirement that also
 * names skills ("5+ years of React") gets the career total with a plain
 * warning that it isn't per skill (the corpus doesn't date skills), and when
 * the total falls short, says the verdict is capped.
 */
export function yearsSentence(minYears: number, now: Date, withSkills: boolean): string {
  const years = careerYears(now);
  const since = `${years} ${years === 1 ? 'year' : 'years'} in software since ${CAREER_START_YEAR}${
    STARTED_AS_INTERN ? ', including an internship' : ''
  } (${now.getUTCFullYear()} − ${CAREER_START_YEAR})`;
  const met = years >= minYears;
  if (withSkills) {
    return met
      ? `Years: ${since}, not per skill; ${minYears} asked.`
      : `Years: ${since}, under the ${minYears} asked, so at most partial.`;
  }
  return `${since}, ${met ? 'meets' : 'short of'} the ${minYears} asked.`;
}

// --- Notes ----------------------------------------------------------------

function cite(evidence: Evidence): string {
  return `${evidenceLabel(evidence)} (${entryLabel(evidence.entry)})`;
}

/**
 * Categories too broad for "Closest" to mean anything. "Cloud and delivery"
 * spans AWS, CI/CD and SLOs, so Kubernetes or Terraform land on the OneHost
 * migration because it automated CI/CD — a stretch. Engineering practice,
 * leadership and research are catch-alls in the same way.
 */
export const NO_CLOSEST_CATEGORIES: ReadonlySet<SkillCategory> = new Set<SkillCategory>([
  'cloud-infra',
  'practice',
  'leadership',
  'research',
]);

/**
 * The most related record for a gap's "Closest" line, or none.
 *
 * "Related" means the record carries at least one canonical tag in a
 * category the requirement names (`SKILL_CATEGORY` for canonical tags, the
 * gap vocabulary for `otherSkills`, e.g. Go → backend), excluding the broad
 * `NO_CLOSEST_CATEGORIES`. Ranked like evidence: more tags in those
 * categories, then a metric, then corpus order. Unknown `otherSkills` have
 * no category, so a requirement naming only those gets no line.
 */
export function closestRelated(
  req: Pick<ExtractedRequirement, 'skills' | 'otherSkills'>,
  corpus: Corpus = CORPUS,
): { evidence: Evidence; category: SkillCategory } | undefined {
  const categories: SkillCategory[] = [];
  const add = (c: SkillCategory | undefined) => {
    if (c && !NO_CLOSEST_CATEGORIES.has(c) && !categories.includes(c)) categories.push(c);
  };
  req.skills.forEach((s) => add(SKILL_CATEGORY[s]));
  req.otherSkills.forEach((s) => add(gapTerm(s)?.category));
  if (categories.length === 0) return undefined;

  let best: { evidence: Evidence; category: SkillCategory; score: number; metric: number } | undefined;
  for (const evidence of corpus.evidence) {
    const inCategory = evidence.skills.filter((s) => categories.includes(SKILL_CATEGORY[s]));
    if (inCategory.length === 0) continue;
    const metric = evidence.metric ? 1 : 0;
    if (!best || inCategory.length > best.score || (inCategory.length === best.score && metric > best.metric)) {
      // The category shown is the requirement's first one this record shares.
      const category = categories.find((c) => inCategory.some((s) => SKILL_CATEGORY[s] === c))!;
      best = { evidence, category, score: inCategory.length, metric };
    }
  }
  return best && { evidence: best.evidence, category: best.category };
}

/** Join sentences, dropping evidence items from the end until it fits. */
function fit(lead: string, items: string[], tail: string[]): string {
  const assemble = (n: number) =>
    [n > 0 ? `${lead}${items.slice(0, n).join(', ')}.` : '', ...tail].filter(Boolean).join(' ');
  for (let n = items.length; n >= 1; n--) {
    const note = assemble(n);
    if (note.length <= NOTE_MAX_CHARS) return note;
  }
  const note = assemble(Math.min(1, items.length));
  return note.length <= NOTE_MAX_CHARS ? note : `${note.slice(0, NOTE_MAX_CHARS - 1)}…`;
}

// --- Judging --------------------------------------------------------------

/**
 * One row, judged. The worker streams these one at a time.
 *
 * - names skills (`skills` or `otherSkills`): `assessSkills` decides. If
 *   `minYears` is set and the career total falls short, strong is capped at
 *   partial. If the text names a qualifier (a domain, scale, setting or
 *   depth; see `qualifiers.ts`) that no cited record covers, strong is
 *   capped at partial too. The note lists the evidence, then the named
 *   skills and domains with none ("Nothing for Go, payments."), then any
 *   other missing qualifier ("No evidence at that scale."), then the years
 *   arithmetic.
 * - names no skills but has `minYears`: judged on years alone — strong if
 *   met, gap if not, with the arithmetic in the note. A met row whose text
 *   names a qualifier nothing in the corpus covers is partial.
 *
 * The requirement's text can only lower a verdict (through a qualifier),
 * never raise one.
 * - names neither: not_assessed, excluded from coverage.
 */
export function judgeRequirement(
  raw: ExtractedRequirement,
  corpus: Corpus = CORPUS,
  now: Date = new Date(),
): Requirement {
  const req = sanitizeRequirement(raw);
  const namesSkills = req.skills.length + req.otherSkills.length > 0;
  const years = req.minYears === null ? '' : yearsSentence(req.minYears, now, namesSkills);
  const yearsShort = req.minYears !== null && careerYears(now) < req.minYears;

  if (!namesSkills) {
    if (req.minYears === null) {
      return { ...req, verdict: 'not_assessed', evidenceIds: [], note: NOT_ASSESSED_NOTE };
    }
    if (yearsShort) return { ...req, verdict: 'gap', evidenceIds: [], note: years };
    // A years-only row cites nothing: its claim is the career, so its
    // qualifiers ("5+ years in fintech") are checked against the whole corpus.
    const missing = missingParts(uncoveredQualifiers(req.text, corpus.evidence));
    const nothing = missing.nothingFor.length ? `Nothing for ${missing.nothingFor.join(', ')}.` : '';
    const capped = nothing !== '' || missing.sentences.length > 0;
    return { ...req, verdict: capped ? 'partial' : 'strong', evidenceIds: [], note: fit('', [], [years, nothing, ...missing.sentences]) };
  }

  const { verdict: skillVerdict, uncovered } = assessSkills(req, corpus);

  if (skillVerdict === 'gap') {
    const closest = closestRelated(req, corpus);
    const closestLine = closest
      ? `Closest ${SKILL_CATEGORIES[closest.category]} work: ${cite(closest.evidence)}.`
      : '';
    return { ...req, verdict: 'gap', evidenceIds: [], note: fit('', [], [GAP_NOTE, closestLine, years]) };
  }

  const evidence = selectEvidence(req.skills, corpus);
  // Qualifiers are checked against the records the row cites, so the badge
  // never vouches for something the visitor can't see evidence of.
  const missing = missingParts(uncoveredQualifiers(req.text, evidence));
  const qualifierShort = missing.nothingFor.length + missing.sentences.length > 0;
  const verdict: Verdict = skillVerdict === 'strong' && (yearsShort || qualifierShort) ? 'partial' : skillVerdict;
  const missingNames = [...uncovered, ...missing.nothingFor];
  const nothingFor = missingNames.length ? `Nothing for ${missingNames.join(', ')}.` : '';
  return {
    ...req,
    verdict,
    evidenceIds: evidence.map((e) => e.id),
    note: fit('Evidence: ', evidence.map(cite), [nothingFor, ...missing.sentences, years]),
  };
}

/**
 * (strong + ½ × partial) over the must-haves that could be assessed.
 * A must-have marked not_assessed is left out of both sides; with no
 * assessable must-haves the answer is 0 of 0, never a division by zero.
 */
export function coverageOf(rows: readonly Requirement[]): NonNullable<FitReport['coverage']> {
  const must = rows.filter((r) => r.priority === 'must' && r.verdict !== 'not_assessed');
  const covered = must.reduce((sum, r) => sum + (r.verdict === 'strong' ? 1 : r.verdict === 'partial' ? 0.5 : 0), 0);
  return { covered, mustHaves: must.length };
}

/**
 * The model-mode report: `prepareExtraction`, then `judgeRequirement` per
 * row, then `coverageOf`. Takes no job description — by construction the JD
 * can't reach a verdict except through what was extracted from it.
 */
export function judge(extraction: Extraction, corpus: Corpus = CORPUS, now: Date = new Date()): FitReport {
  const prepared = prepareExtraction(extraction);
  const requirements = prepared.requirements.map((req) => judgeRequirement(req, corpus, now));
  return { role: prepared.role, mode: 'model', requirements, coverage: coverageOf(requirements) };
}
