import { z } from 'zod';

import { SKILLS_TABLE } from '@/data/corpus/skills';

/**
 * FIT CHECKER CONTRACT — the seam between the model and the code that judges.
 *
 * The model (in a Web Worker, on the visitor's device) produces an
 * `Extraction` and nothing else. It never sees the evidence corpus and never
 * produces a verdict, so it has nothing to cite and nothing to oversell.
 * Everything in `FitReport` beyond the extraction is computed in code from
 * `CORPUS`. See docs/plans/2026-09-23-ai-features.md, Phase 2.
 *
 * Shared by the worker, the no-model skill scan, the UI and the eval runner,
 * so CI grades the same shapes visitors see. Change it deliberately.
 */

export const JD_MAX_CHARS = 12_000;
/** Merged requirement rows; code-first extraction can find more than a model listed. */
export const MAX_REQUIREMENTS = 25;

const skillIds = SKILLS_TABLE.map((skill) => skill.id);

/** The corpus's canonical skill tags, as an enum the decoder can constrain to. */
export const CanonicalSkillId = z.enum(skillIds as [string, ...string[]]);
export type CanonicalSkillId = z.infer<typeof CanonicalSkillId>;

export const ExtractedRequirement = z.object({
  /** The requirement, paraphrased from the JD. */
  text: z.string().min(1).max(200),
  priority: z.enum(['must', 'nice']),
  /** Canonical tags the requirement names (the model maps synonyms). */
  skills: z.array(CanonicalSkillId).max(6),
  /** Skills the JD names that are not in the vocabulary, e.g. "Go". */
  otherSkills: z.array(z.string().min(1).max(40)).max(6),
  /** "5+ years of …" → 5; null when the requirement states no minimum. */
  minYears: z.number().int().min(0).max(30).nullable(),
});
export type ExtractedRequirement = z.infer<typeof ExtractedRequirement>;

/** Exactly what the model must emit. */
export const Extraction = z.object({
  role: z.string().min(1).max(120),
  requirements: z.array(ExtractedRequirement).max(MAX_REQUIREMENTS),
});
export type Extraction = z.infer<typeof Extraction>;

/** JSON Schema for constrained decoding (WebLLM / XGrammar, llama.cpp). */
export const EXTRACTION_JSON_SCHEMA = z.toJSONSchema(Extraction);

export const Verdict = z.enum(['strong', 'partial', 'gap', 'not_assessed']);
export type Verdict = z.infer<typeof Verdict>;

export const Requirement = ExtractedRequirement.extend({
  verdict: Verdict,
  evidenceIds: z.array(z.string()).max(3),
  /** Templated in code, never generated. */
  note: z.string().max(200),
});
export type Requirement = z.infer<typeof Requirement>;

export const FitReport = z.object({
  role: z.string(),
  /**
   * `model`: code-first extraction with the model's per-segment decisions.
   * `scan`: the same pipeline with default decisions (no model).
   */
  mode: z.enum(['model', 'scan']),
  requirements: z.array(Requirement),
  /** Null when no must-haves could be identified (e.g. a headerless JD in scan mode). */
  coverage: z
    .object({ covered: z.number().min(0), mustHaves: z.number().int().min(0) })
    .nullable(),
});
export type FitReport = z.infer<typeof FitReport>;

// ---------------------------------------------------------------------------
// Code-first extraction (plan v4, Phase 2a).
//
// Code segments the JD and finds everything it can deterministically:
// section, priority, skills, years. The model then makes one small decision
// per candidate segment, and the grammar forces exactly one decision per
// segment, in order, so it cannot skip a requirement. Merging code's findings
// with the model's decisions produces the `ExtractedRequirement[]` that
// `judge` already consumes. Without a model the same pipeline runs with
// `defaultDecision`, which is the no-model ("scan") path.
// ---------------------------------------------------------------------------

/** Upper bound on segments sent to the model; keeps the prompt small. */
export const MAX_CANDIDATES = 40;

export const Section = z.enum([
  'requirements', // "Requirements", "Qualifications", "What you bring"
  'preferred', // "Nice to have", "Preferred", "Bonus"
  'responsibilities', // "What you'll do", "Responsibilities"
  'about', // company / team blurb, never a requirement
  'benefits', // pay, perks, EEO text, never a requirement
  'unknown', // before any header, or a header code didn't recognise
]);
export type Section = z.infer<typeof Section>;

export const Segment = z.object({
  /** Position among ALL segments, stable for the report. */
  index: z.number().int().min(0),
  /** The JD's own words, trimmed of bullet markers. Never paraphrased. */
  text: z.string().min(1),
  section: Section,
  /** From the section header; null when code can't tell. */
  priority: z.enum(['must', 'nice']).nullable(),
  /** Found by code (alias scan). The model may add, never remove. */
  skills: z.array(CanonicalSkillId),
  /** Gap-vocabulary terms found by code, e.g. "Go". */
  otherSkills: z.array(z.string().min(1).max(40)),
  /** From a years regex; null when none is stated. */
  minYears: z.number().int().min(0).max(30).nullable(),
  /**
   * Set by code on a responsibilities segment of a JD that also lists
   * requirements, when it isn't worth a row without a model: `summary`, a
   * prose sentence of the role pitch; `restated`, a duty whose skills the
   * requirements already name. Absent otherwise.
   */
  duty: z.enum(['summary', 'restated']).optional(),
});
export type Segment = z.infer<typeof Segment>;

export const SegmentedJd = z.object({
  /** Determined by code; "Role not stated" when it can't. */
  role: z.string().min(1).max(120),
  segments: z.array(Segment),
  /** Indices (into `segments`) the model is asked about, in order. */
  candidates: z.array(z.number().int().min(0)).max(MAX_CANDIDATES),
});
export type SegmentedJd = z.infer<typeof SegmentedJd>;

/** The model's whole job, per candidate segment. */
export const SegmentDecision = z.object({
  /** Is this segment a requirement of the candidate (not a duty, perk or blurb)? */
  requirement: z.boolean(),
  /** Used only when the segment's code-derived priority is null. */
  priority: z.enum(['must', 'nice']),
  /** Canonical skills the segment names that code's alias scan missed. */
  addSkills: z.array(CanonicalSkillId).max(4),
});
export type SegmentDecision = z.infer<typeof SegmentDecision>;

/** Exactly `candidates.length` decisions, in candidate order (grammar-enforced). */
export const Decisions = z.object({
  decisions: z.array(SegmentDecision),
});
export type Decisions = z.infer<typeof Decisions>;

/** A chat message in the shape WebLLM and llama.cpp both accept. */
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}
