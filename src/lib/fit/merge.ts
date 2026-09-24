import {
  CanonicalSkillId,
  MAX_REQUIREMENTS,
  type ExtractedRequirement,
  type Extraction,
  type Segment,
  type SegmentDecision,
  type SegmentedJd,
} from './contract';

/**
 * STEPS 7–8: the per-segment decision and the merge (plan v4, Phase 2a).
 *
 * The model's whole job is one `SegmentDecision` per candidate segment. Code
 * then builds the `ExtractedRequirement` rows `judge` consumes: the text is
 * the segment's own, code's skills are a floor the model can only add to,
 * and code's priority wins wherever a header or cue gave one.
 */

const TEXT_MAX = 200;
const SKILLS_MAX = 6;

const namesSkill = (s: Segment) => s.skills.length + s.otherSkills.length > 0;

/**
 * Company voice: a line about the employer ("We're a remote-first team…",
 * "Our stack is…", "Join us…"), not a demand on the candidate.
 */
const COMPANY_VOICE = /^(?:(?:we|we're|we’re|we've|we’ve|we'll|we’ll|our|us|join)\b|at [A-Z][\w&.-]*,)/i;

/**
 * A segment that isn't a requirement by itself: a lead-in that ends in ":"
 * ("You'll need:"), company voice ("We don't expect you to tick every box"),
 * or a whole paragraph (over 300 characters) rather than an item.
 */
export function isBlurb(text: string): boolean {
  return /:$/.test(text.trim()) || COMPANY_VOICE.test(text.trim()) || text.length > 300;
}

/**
 * The decision used without a model (the "scan" path), one rule per section:
 *
 * - requirements / preferred: kept if it names a skill or years, or isn't a
 *   blurb (see `isBlurb`). Soft skills are kept and judge as not assessed.
 *   Priority comes from the header (or an inline cue) in the merge.
 * - responsibilities: kept only if it names a skill, as `nice` (a duty that
 *   names a technology is worth showing, but it isn't a must-have). An
 *   inline "a plus" cue already made it nice; nothing makes it must.
 * - unknown (before any header, or under an unrecognised one): kept only if
 *   it names a skill or years and isn't company voice. Priority `nice`
 *   unless an inline cue made it must ("Go experience required"), so a
 *   headerless JD's rows stay out of coverage unless it says "required".
 * - about / benefits: never (they aren't candidates anyway).
 *
 * `addSkills` is always empty: without a model nothing is added to code's
 * alias scan.
 */
export function defaultDecision(segment: Segment): SegmentDecision {
  const skill = namesSkill(segment);
  const years = segment.minYears !== null;
  let requirement: boolean;
  switch (segment.section) {
    case 'requirements':
    case 'preferred':
      requirement = skill || years || !isBlurb(segment.text);
      break;
    case 'responsibilities':
      requirement = skill;
      break;
    case 'unknown':
      requirement = (skill || years) && !isBlurb(segment.text);
      break;
    default:
      requirement = false;
  }
  return { requirement, priority: segment.section === 'requirements' ? 'must' : 'nice', addSkills: [] };
}

/** "…" past 200 characters, the contract's limit; whitespace collapsed. */
function clipText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > TEXT_MAX ? `${flat.slice(0, TEXT_MAX - 1)}…` : flat;
}

/**
 * One candidate's row, or null when the decision says it isn't a
 * requirement. The streaming form: the worker calls this as each decision
 * finishes decoding. `candidatePos` is the position in `seg.candidates`.
 *
 * - text: the segment's own words, clipped to 200 characters with "…".
 * - skills: code's, then the model's additions (unknown ids dropped,
 *   duplicates removed), at most 6 — code's come first, so an addition can
 *   never push out, replace or remove a skill code found.
 * - otherSkills, minYears: code's only.
 * - priority: code's (header or cue), else the decision's.
 */
export function mergeOne(seg: SegmentedJd, candidatePos: number, decision: SegmentDecision): ExtractedRequirement | null {
  const index = seg.candidates[candidatePos];
  const segment = index === undefined ? undefined : seg.segments[index];
  if (!segment) throw new RangeError(`No candidate at position ${candidatePos} (${seg.candidates.length} candidates)`);
  if (!decision.requirement) return null;

  const skills: CanonicalSkillId[] = [];
  for (const id of [...segment.skills, ...(Array.isArray(decision.addSkills) ? decision.addSkills : [])]) {
    if (!skills.includes(id) && CanonicalSkillId.safeParse(id).success) skills.push(id);
  }
  return {
    text: clipText(segment.text),
    priority: segment.priority ?? (decision.priority === 'must' ? 'must' : 'nice'),
    skills: skills.slice(0, SKILLS_MAX),
    otherSkills: segment.otherSkills.slice(0, SKILLS_MAX),
    minYears: segment.minYears,
  };
}

/**
 * At most MAX_REQUIREMENTS rows: when there are more, must-haves are kept
 * before nice-to-haves, earlier before later; the kept rows stay in
 * document order.
 */
export function capRequirements(rows: readonly ExtractedRequirement[]): ExtractedRequirement[] {
  if (rows.length <= MAX_REQUIREMENTS) return [...rows];
  const keep = new Set(
    rows
      .map((row, i) => ({ row, i }))
      .sort((a, b) => Number(a.row.priority === 'nice') - Number(b.row.priority === 'nice') || a.i - b.i)
      .slice(0, MAX_REQUIREMENTS)
      .map(({ i }) => i),
  );
  return rows.filter((_, i) => keep.has(i));
}

/**
 * Step 8: every decision merged (`mergeOne`), then capped
 * (`capRequirements`). Decisions align with `seg.candidates`; a different
 * number of them is a bug (the grammar fixes the count), so it throws.
 */
export function mergeDecisions(seg: SegmentedJd, decisions: readonly SegmentDecision[]): Extraction {
  if (decisions.length !== seg.candidates.length) {
    throw new RangeError(`Expected ${seg.candidates.length} decisions, got ${decisions.length}`);
  }
  const rows = decisions
    .map((decision, pos) => mergeOne(seg, pos, decision))
    .filter((row): row is ExtractedRequirement => row !== null);
  return { role: seg.role, requirements: capRequirements(rows) };
}
