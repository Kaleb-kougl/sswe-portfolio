/**
 * The fit checker's pure core: contract, segmentation, prompt, merge,
 * judging, the skill scan and export.
 * Safe to import in a Web Worker — no DOM, no Node APIs, no React.
 */
export * from './contract';
export {
  buildDecisionMessages,
  candidateLines,
  PROMPT_SEGMENT_CHARS,
  SECTION_TAGS,
  SYSTEM_PROMPT,
  validateJd,
  vocabularyLines,
} from './prompt';
export type { JdCheck, JdRejection } from './prompt';
export type { SkillAssessment } from './judge';
export {
  careerYears,
  closestRelated,
  coverageOf,
  assessSkills,
  meetsStrongBar,
  NO_CLOSEST_CATEGORIES,
  selectEvidence,
  yearsSentence,
  GAP_NOTE,
  judge,
  judgeRequirement,
  MAX_EVIDENCE,
  NOT_ASSESSED_NOTE,
  NOTE_MAX_CHARS,
  prepareExtraction,
  rankEvidence,
  ROLE_FALLBACK,
  sanitizeRequirement,
} from './judge';
export { detectSkills, SCAN_DISCLAIMER, SCAN_SHADOW_TERMS, SCAN_STOP_TERMS, termPattern } from './scan';
export {
  analyzeText,
  BOILERPLATE,
  classifyHeader,
  findRole,
  HEADER_LEXICON,
  MUST_CUE,
  NICE_CUE,
  normalizeHeader,
  parseMinYears,
  yearsAreSoftware,
  segmentJd,
  segmentPriority,
  selectCandidates,
  splitSentences,
} from './segment';
export { capRequirements, defaultDecision, isBlurb, mergeDecisions, mergeOne } from './merge';
export { analyzeWithDecisions, analyzeWithoutModel, reportCoverage } from './analyze';
export { coverageLine, escapeMarkdown, NO_COVERAGE_LINE, reportToMarkdown, VERDICT_LABELS } from './markdown';
export { entryLabel, EVIDENCE_LABELS, evidenceLabel } from './labels';
