import { describe, it, expect } from 'vitest';

import { CanonicalSkillId, Decisions, MAX_CANDIDATES, SegmentDecision, type SegmentDecision as Decision } from '@/lib/fit/contract';
import { DECISION_KEYS, MAX_ADD_SKILLS, decisionsGrammar, decisionsMaxTokens } from '@/lib/fit/local/grammar';

/**
 * XGrammar only runs in the browser, so these tests compile the EBNF to a
 * RegExp (the grammar has no recursion, so it is a regular language) and
 * hold it to the contract: exactly n items, keys in contract order, the
 * canonical vocabulary, no free whitespace.
 */

/** A tiny EBNF → RegExp compiler for XGrammar's subset used by grammar.ts. */
function toRegExp(grammar: string): RegExp {
  const rules = new Map<string, string>();
  for (const line of grammar.split('\n')) {
    const m = /^(\w+) ::= (.*)$/.exec(line);
    if (!m) throw new Error(`bad rule line: ${line}`);
    rules.set(m[1], m[2]);
  }
  const compile = (body: string, depth = 0): string => {
    if (depth > 20) throw new Error('recursive grammar');
    let out = '';
    let i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === ' ') {
        i++;
      } else if (ch === '"') {
        let j = i + 1;
        let text = '';
        while (body[j] !== '"') {
          if (body[j] === '\\') {
            const next = body[j + 1];
            text += next === 'n' ? '\n' : next === 't' ? '\t' : next;
            j += 2;
          } else text += body[j++];
        }
        out += text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        i = j + 1;
      } else if (ch === '[') {
        const j = body.indexOf(']', i + 1);
        out += body.slice(i, j + 1);
        i = j + 1;
      } else if (ch === '(') {
        out += '(?:';
        i++;
      } else if ('|)?*+'.includes(ch)) {
        out += ch;
        i++;
      } else if (ch === '{') {
        const j = body.indexOf('}', i);
        out += body.slice(i, j + 1);
        i = j + 1;
      } else {
        const m = /^\w+/.exec(body.slice(i))!;
        const ref = rules.get(m[0]);
        if (ref === undefined) throw new Error(`unknown rule ${m[0]}`);
        out += `(?:${compile(ref, depth + 1)})`;
        i += m[0].length;
      }
    }
    return out;
  };
  return new RegExp(`^(?:${compile(rules.get('root')!)})$`);
}

const decision = (d: Partial<Decision> = {}): Decision => ({ requirement: true, priority: 'must', addSkills: [], ...d });
const doc = (items: Decision[]) => JSON.stringify({ decisions: items });

describe('decisionsGrammar', () => {
  it.each([1, 2, 5, 17, MAX_CANDIDATES])('accepts exactly %i decisions and rejects n ± 1', (n) => {
    const re = toRegExp(decisionsGrammar(n));
    const items = Array.from({ length: n + 1 }, (_, k) =>
      decision({ requirement: k % 2 === 0, priority: k % 3 ? 'nice' : 'must', addSkills: k % 4 ? ['react'] : [] }),
    );
    expect(re.test(doc(items.slice(0, n)))).toBe(true);
    expect(re.test(doc(items.slice(0, n + 1)))).toBe(false);
    expect(re.test(doc(items.slice(0, n - 1)))).toBe(false);
    // …and what it accepts is a valid `Decisions` of length n.
    expect(Decisions.parse(JSON.parse(doc(items.slice(0, n)))).decisions).toHaveLength(n);
  });

  it('holds the contract key order; any other order is rejected', () => {
    expect(DECISION_KEYS).toEqual(['requirement', 'priority', 'addSkills']);
    const re = toRegExp(decisionsGrammar(1));
    expect(re.test('{"decisions":[{"requirement":true,"priority":"nice","addSkills":[]}]}')).toBe(true);
    expect(re.test('{"decisions":[{"priority":"nice","requirement":true,"addSkills":[]}]}')).toBe(false);
    expect(re.test('{"decisions":[{"requirement":true,"addSkills":[],"priority":"nice"}]}')).toBe(false);
  });

  it('allows canonical ids only, at most four, and no whitespace outside literals', () => {
    const re = toRegExp(decisionsGrammar(1));
    const ids = CanonicalSkillId.options;
    expect(re.test(doc([decision({ addSkills: ids.slice(0, MAX_ADD_SKILLS) })]))).toBe(true);
    expect(re.test(doc([decision({ addSkills: ids.slice(0, MAX_ADD_SKILLS + 1) })]))).toBe(false);
    expect(re.test(doc([decision({ addSkills: ['not-a-skill'] })]))).toBe(false);
    expect(re.test('{"decisions":[{"requirement":maybe,"priority":"nice","addSkills":[]}]}')).toBe(false);
    expect(re.test('{"decisions":[{"requirement":true,"priority":"high","addSkills":[]}]}')).toBe(false);
    expect(re.test('{"decisions": [{"requirement":true,"priority":"nice","addSkills":[]}]}')).toBe(false);
    expect(re.test(JSON.stringify({ decisions: [decision()] }, null, 1))).toBe(false);
    expect(SegmentDecision.shape.addSkills.def.checks?.length ?? 1).toBeGreaterThan(0);
  });

  it('lists exactly the canonical skill ids; no strings, so no length bounds', () => {
    const g = decisionsGrammar(3);
    const skillRule = g.split('\n').find((l) => l.startsWith('skill ::= '))!;
    const ids = [...skillRule.matchAll(/"\\"([a-z0-9-]+)\\""/g)].map((m) => m[1]);
    expect(ids).toEqual(CanonicalSkillId.options);
    // The v3 lesson: bounded character repetitions made masking ~9× slower.
    expect(g).not.toMatch(/char/);
    expect(g).not.toMatch(/\[\^/);
  });

  it('numbered variant (experiment): item k must carry segment k, and parses to the contract', () => {
    const re = toRegExp(decisionsGrammar(2, CanonicalSkillId.options, true));
    const numbered = '{"decisions":[{"segment":1,"requirement":true,"priority":"must","addSkills":[]},{"segment":2,"requirement":false,"priority":"nice","addSkills":[]}]}';
    expect(re.test(numbered)).toBe(true);
    expect(re.test(numbered.replace('"segment":2', '"segment":1'))).toBe(false);
    expect(re.test(doc([decision(), decision()]))).toBe(false);
    const parsed = Decisions.parse(JSON.parse(numbered));
    expect(parsed.decisions[0]).toEqual(decision());
  });

  it('refuses n outside 1..MAX_CANDIDATES (n = 0 skips the model)', () => {
    expect(() => decisionsGrammar(0)).toThrow(RangeError);
    expect(() => decisionsGrammar(MAX_CANDIDATES + 1)).toThrow(RangeError);
    expect(() => decisionsGrammar(1.5)).toThrow(RangeError);
  });

  it('escapes quotes and backslashes in literals', () => {
    const g = decisionsGrammar(1, ['a"b', 'c\\d']);
    expect(g).toContain('"\\"a\\\\\\"b\\""');
    expect(toRegExp(g).test('{"decisions":[{"requirement":true,"priority":"must","addSkills":["a\\"b"]}]}')).toBe(true);
  });

  it('sizes max_tokens from n, with room for the longest item', () => {
    expect(decisionsMaxTokens(1)).toBe(72);
    expect(decisionsMaxTokens(MAX_CANDIDATES)).toBe(MAX_CANDIDATES * 40 + 32);
    // The budget is shared by all n items. An item with two of the longest
    // ids fits it at 3 chars/token (measured Llama/Qwen JSON runs: ~3.5); the absolute worst item
    // (four long ids) does not, but n of those is not a realistic output, and
    // truncation falls back to defaultDecision for the rest (run.ts).
    const longIds = [...CanonicalSkillId.options].sort((a, b) => b.length - a.length);
    const twoIds = JSON.stringify(decision({ requirement: false, addSkills: longIds.slice(0, 2) }));
    expect(decisionsMaxTokens(1) - 32).toBeGreaterThanOrEqual(Math.ceil(twoIds.length / 3));
  });
});
