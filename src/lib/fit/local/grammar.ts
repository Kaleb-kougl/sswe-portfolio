import { CanonicalSkillId, MAX_REQUIREMENTS } from '@/lib/fit/contract';

/**
 * THE DECODING GRAMMAR — the contract's `Extraction`, as compact JSON, in
 * XGrammar EBNF (`response_format: { type: 'grammar', grammar }`).
 *
 * Why not `{ type: 'json_object', schema: EXTRACTION_JSON_SCHEMA }`? WebLLM
 * 0.2.85 compiles a schema with XGrammar's `anyWhitespace = true` and no
 * whitespace cap, and exposes no option to change that. Measured in headless
 * Chromium with Llama-3.2-1B at temperature 0: after two requirements the
 * model emitted whitespace until `max_tokens` (2,149 chars, the last 1,431 of
 * them spaces), so the document never closed. This grammar is the same
 * schema with NO optional whitespace: keys in contract order, one fixed
 * separator, so the only free text is inside strings.
 *
 * String LENGTHS are deliberately not in the grammar. The same grammar with
 * `char{1,200}`-style bounds (which is also what the schema route compiles
 * `maxLength` to) cost 150 ms of grammar masking per token on the reference
 * run (6 tok/s, first row at 13.6 s); with `char+` it is 17 ms/token
 * (35 tok/s, first row at 2.1 s). Lengths are enforced after decoding
 * instead: `judgeRequirement` / `prepareExtraction` clip text, role and
 * other-skill names to the contract's limits, and `max_tokens` bounds a
 * runaway string.
 *
 * Everything else is the contract, exactly: ≤ 15 requirements, priority
 * must|nice, ≤ 6 canonical skill ids, ≤ 6 other skills, minYears an integer
 * 0–30 or null, keys in contract order. A test holds it to the Zod schema's
 * shape, so it can't drift silently.
 */

const MAX_SKILLS = 6;

/** An EBNF string literal for `text` (C-style escapes). */
function lit(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function list(item: string, max: number): string {
  return `"[" (${item} ("," ${item}){0,${max - 1}})? "]"`;
}

export function buildExtractionGrammar(skillIds: readonly string[] = CanonicalSkillId.options): string {
  const skills = skillIds.map((id) => lit(JSON.stringify(id))).join(' | ');
  return [
    `root ::= ${lit('{"role":')} string ${lit(',"requirements":')} ${list('req', MAX_REQUIREMENTS)} "}"`,
    `req ::= ${lit('{"text":')} string ${lit(',"priority":')} priority ${lit(',"skills":')} skills ${lit(
      ',"otherSkills":',
    )} others ${lit(',"minYears":')} years "}"`,
    `priority ::= ${lit('"must"')} | ${lit('"nice"')}`,
    `skills ::= ${list('skill', MAX_SKILLS)}`,
    `skill ::= ${skills}`,
    `others ::= ${list('string', MAX_SKILLS)}`,
    `years ::= "null" | [0-9] | [1-2] [0-9] | "30"`,
    `string ::= "\\"" char+ "\\""`,
    // Any JSON string character except control characters; escapes allowed.
    `char ::= [^"\\\\\\x00-\\x1f] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F]{4})`,
  ].join('\n');
}

export const EXTRACTION_GRAMMAR = buildExtractionGrammar();
