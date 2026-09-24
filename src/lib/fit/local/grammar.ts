import { CanonicalSkillId, MAX_CANDIDATES, SegmentDecision } from '@/lib/fit/contract';

/**
 * THE DECODING GRAMMAR — the contract's `Decisions`, as compact JSON, in
 * XGrammar EBNF (`response_format: { type: 'grammar', grammar }`), built per
 * run for EXACTLY `n` candidate segments (plan v4, Phase 2a step 7):
 *
 *   {"decisions":[{"requirement":true,"priority":"must","addSkills":["react"]},…]}
 *
 * Exactly n items is the point of v4: the model can't skip a segment or add
 * one, so "which requirements exist" is decided by code, and decision k
 * always belongs to candidate k.
 *
 * Lessons kept from the v3 extraction grammar (measured in headless Chromium,
 * Llama-3.2-1B, temperature 0):
 * - NO optional whitespace. WebLLM 0.2.85's schema route compiles with
 *   XGrammar's `anyWhitespace = true` and no cap; the model emitted spaces
 *   until `max_tokens` and the document never closed. Keys come in contract
 *   order with one fixed separator, so the output is a single path of
 *   literals plus the few choices below.
 * - NO bounded-length repetitions on characters (`char{1,200}`): they cost
 *   ~9× in grammar masking per token. This grammar has no strings at all
 *   (every value is a literal: true/false, must/nice, a canonical id), so
 *   there is nothing to bound; `addSkills`' ≤ 4 is a repetition over whole
 *   ids, which is cheap.
 *
 * The item list is unrolled (`item "," item "," …`) rather than written as a
 * counted repetition, so it means exactly n in any EBNF dialect.
 */

/** `addSkills` limit, from the contract (`SegmentDecision.addSkills.max(4)`). */
export const MAX_ADD_SKILLS = 4;

/** An EBNF string literal for `text` (C-style escapes). */
function lit(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * EXPERIMENT (evals/local, off): prefix each item with its segment number,
 * `{"segment":3,"requirement":…}`, to anchor decision k to line "k." of the
 * prompt. `SegmentDecision.parse` strips the extra key. Measured 2026-09-23
 * (evals/local/results): without it, every model's addSkills for item k
 * named item k+1's skills, and Llama-3.2-1B copied the prompt example's
 * decisions verbatim; numbering raised keep/drop accuracy from 53 → 73%
 * (Llama-3.2-1B), 56 → 85% (Qwen2.5-1.5B) and 83 → 89% (Qwen3-1.7B), for
 * ~5 more tokens per item. Off because no model beats the no-model path
 * yet either way; turn it on if a model ships.
 */
export const NUMBERED_DECISIONS = false;

/** The fixed part of the grammar (everything but `root`). */
function itemRules(skillIds: readonly string[]): string[] {
  const skills = skillIds.map((id) => lit(JSON.stringify(id))).join(' | ');
  return [
    `body ::= ${lit('"requirement":')} bool ${lit(',"priority":')} priority ${lit(',"addSkills":')} skills "}"`,
    `bool ::= "true" | "false"`,
    `priority ::= ${lit('"must"')} | ${lit('"nice"')}`,
    `skills ::= "[" (skill ("," skill){0,${MAX_ADD_SKILLS - 1}})? "]"`,
    `skill ::= ${skills}`,
  ];
}

/**
 * The grammar for exactly `n` decisions (1 ≤ n ≤ MAX_CANDIDATES). There is
 * no grammar for n = 0: with no candidate segments the run skips the model.
 */
export function decisionsGrammar(
  n: number,
  skillIds: readonly string[] = CanonicalSkillId.options,
  numbered = NUMBERED_DECISIONS,
): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX_CANDIDATES) {
    throw new RangeError(`decisionsGrammar: n must be an integer in 1..${MAX_CANDIDATES}, got ${n}`);
  }
  const items = Array.from({ length: n }, (_, k) => (numbered ? `item${k + 1}` : 'item'));
  const itemDefs = numbered
    ? items.map((name, k) => `${name} ::= ${lit(`{"segment":${k + 1},`)} body`)
    : [`item ::= "{" body`];
  return [
    `root ::= ${lit('{"decisions":[')} ${items.join(' "," ')} ${lit(']}')}`,
    ...itemDefs,
    ...itemRules(skillIds),
  ].join('\n');
}

/** Keys of one decision, in the order the grammar emits them (= the contract's). */
export const DECISION_KEYS = Object.keys(SegmentDecision.shape);

/**
 * Output budget for n decisions. Measured on the real runtime
 * (evals/local/results, 2026-09-23): 15–18 output tokens per candidate
 * (median) for Llama-3.2-1B, Qwen2.5-1.5B and Qwen3-1.7B; the worst run
 * averaged 33.6 (Qwen3 adding four ids to every item). An item with no
 * additions is ~15 tokens and each id adds ~3–5, so 40 per item holds four
 * long ids; + 32 covers the wrapper. The grammar is finite, so this can
 * only ever cut a pathological output, and run.ts falls back per item then.
 */
export function decisionsMaxTokens(n: number): number {
  return n * 40 + 32;
}
