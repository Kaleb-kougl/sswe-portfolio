import { describe, it, expect } from 'vitest';

import { CanonicalSkillId, EXTRACTION_JSON_SCHEMA, Extraction, ExtractedRequirement } from '@/lib/fit/contract';
import { EXTRACTION_GRAMMAR, buildExtractionGrammar } from '@/lib/fit/local/grammar';

/**
 * The grammar is hand-derived from the contract, so these tests hold it to
 * the contract's JSON Schema: same keys in the same order, same limits,
 * same skill vocabulary. (XGrammar itself only runs in the browser.)
 */

type Json = Record<string, any>;
const schema = EXTRACTION_JSON_SCHEMA as Json;
const reqSchema = schema.properties.requirements.items as Json;

const rule = (name: string) => EXTRACTION_GRAMMAR.split('\n').find((l) => l.startsWith(`${name} ::= `))!;

describe('EXTRACTION_GRAMMAR', () => {
  it('emits keys in contract order', () => {
    expect(rule('root')).toContain(JSON.stringify(`{"${Object.keys(Extraction.shape)[0]}":`));
    const keys = [...rule('req').matchAll(/\\"(\w+)\\":/g)].map((m) => m[1]);
    expect(keys).toEqual(Object.keys(ExtractedRequirement.shape));
    expect(keys).toEqual(Object.keys(reqSchema.properties));
  });

  it('matches the schema item limits; string lengths are left to the judge', () => {
    expect(rule('root')).toContain(`{0,${schema.properties.requirements.maxItems - 1}}`);
    expect(rule('skills')).toContain(`{0,${reqSchema.properties.skills.maxItems - 1}}`);
    expect(rule('others')).toContain(`{0,${reqSchema.properties.otherSkills.maxItems - 1}}`);
    expect(reqSchema.properties.minYears.anyOf[0].maximum).toBe(30);
    // Bounded repetitions on characters made masking ~9x slower (grammar.ts).
    expect(rule('string')).toBe('string ::= "\\"" char+ "\\""');
    expect(EXTRACTION_GRAMMAR).not.toMatch(/char\{/);
  });

  it('lists exactly the canonical skill ids and priorities', () => {
    const ids = [...rule('skill').matchAll(/"\\"([a-z0-9-]+)\\""/g)].map((m) => m[1]);
    expect(ids).toEqual(CanonicalSkillId.options);
    expect(reqSchema.properties.priority.enum).toEqual(['must', 'nice']);
    expect(rule('priority')).toBe('priority ::= "\\"must\\"" | "\\"nice\\""');
  });

  it('allows no free whitespace outside strings', () => {
    const outsideStrings = EXTRACTION_GRAMMAR.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    // Spaces in the EBNF are only token separators; no rule admits [ \t\n].
    expect(EXTRACTION_GRAMMAR).not.toMatch(/\[\s*\\?[ tn]/);
    expect(outsideStrings).not.toMatch(/ws\b/);
  });

  it('escapes quotes and backslashes in literals', () => {
    const g = buildExtractionGrammar(['a"b', 'c\\d']);
    expect(g).toContain('"\\"a\\\\\\"b\\""');
  });
});
