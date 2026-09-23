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
export const MAX_REQUIREMENTS = 15;

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
  /** `model`: from an Extraction. `scan`: the no-model keyword scan. */
  mode: z.enum(['model', 'scan']),
  requirements: z.array(Requirement),
  /** Null in `scan` mode: without extraction there are no must-haves. */
  coverage: z
    .object({ covered: z.number().min(0), mustHaves: z.number().int().min(0) })
    .nullable(),
});
export type FitReport = z.infer<typeof FitReport>;

/** A chat message in the shape WebLLM and llama.cpp both accept. */
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}
