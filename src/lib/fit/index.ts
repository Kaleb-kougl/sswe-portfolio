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
  exampleLists,
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
export { detectQualifiers, DOMAINS, fromEmployment, missingParts, RULES, showsLeadership, statedSizes, uncoveredQualifiers } from './qualifiers';
export type { Qualifier, QualifierKind, ScaleKind } from './qualifiers';
export { detectSkills, SCAN_DISCLAIMER, SCAN_SHADOW_TERMS, SCAN_STOP_TERMS, termPattern } from './scan';
export {
  analyzeText,
  APPLICATION_NOTE,
  BOILERPLATE,
  LOGISTICS,
  PAY_NOTE,
  REQUIREMENT_VOICE,
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
export { capRequirements, COMPANY_VOICE, defaultDecision, DESCRIPTION, isBlurb, mergeDecisions, mergeOne, PITCH } from './merge';
export { analyzeWithDecisions, analyzeWithoutModel, reportCoverage } from './analyze';
export {
  MAX_PROPOSALS,
  PROPOSAL_HINTS,
  proposeSkills,
  routeAll,
  routeReasons,
  scoreProposals,
  uncertainSegments,
} from './route';
export type { Proposal, RouteReason } from './route';
export { countOverrides, decide, decideAll, groupAnswers, NEVER, priorityApplies, THRESHOLDS } from './abstain';
export type { Answer, DecisionTrace, Overrides, QuestionKind, QuestionMode, SegmentAnswers, Thresholds } from './abstain';
export { pYesFrom, QUESTION_SYSTEM_PROMPT, questionMessages, QUESTIONS, SECTION_NAMES, YES_NO_GRAMMAR } from './questions';
export type { Question, TopLogprob } from './questions';
export { coverageLine, escapeMarkdown, NO_COVERAGE_LINE, reportToMarkdown, VERDICT_LABELS } from './markdown';
export { entryLabel, EVIDENCE_LABELS, evidenceLabel } from './labels';
export { degreeOptional, judgeDegree, judgeDegreePaths, parseDegreeAsk, parseDegreePaths } from './degree';
export type { DegreeAsk, DegreeLevel, DegreePath } from './degree';
export { levelLine, levelOf } from './level';
export type { Level } from './level';
