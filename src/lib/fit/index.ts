/**
 * The fit checker's pure core: contract, prompt, judging, scan and export.
 * Safe to import in a Web Worker — no DOM, no Node APIs, no React.
 */
export * from './contract';
export { buildExtractionMessages, SYSTEM_PROMPT, validateJd, vocabularyLines } from './prompt';
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
export { detectSkills, SCAN_DISCLAIMER, SCAN_PRIORITY, SCAN_STOP_TERMS, scanJd, scanRole, termPattern } from './scan';
export { coverageLine, escapeMarkdown, reportToMarkdown, VERDICT_LABELS } from './markdown';
export { entryLabel, EVIDENCE_LABELS, evidenceLabel } from './labels';
