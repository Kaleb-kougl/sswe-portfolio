import { describe, it, expect } from 'vitest';

import { createArrayItemExtractor } from '@/lib/fit/local/json-stream';

/**
 * The extractor's promise is "chunking never changes the answer": whatever
 * way the model's tokens split the document, the same items come out, each
 * exactly once, as soon as its closing bracket arrives.
 */

const REQ_A = {
  text: 'Build UIs in "React" with a \\ backslash',
  priority: 'must',
  skills: ['react', 'typescript'],
  otherSkills: [],
  minYears: 5,
};
const REQ_B = {
  text: 'Nested [brackets] and {braces} in text, plus commas',
  priority: 'nice',
  skills: [],
  otherSkills: ['Go', 'K8s'],
  minYears: null,
};
const REQ_C = { text: 'unicode é and \\u escape ☃', priority: 'must', skills: ['wcag'], otherSkills: [], minYears: 0 };

const DOC = JSON.stringify({ role: 'Frontend Engineer', requirements: [REQ_A, REQ_B, REQ_C] }, null, 1);

function feedAll(chunks: string[], key = 'requirements') {
  const extractor = createArrayItemExtractor(key);
  const items: string[] = [];
  for (const chunk of chunks) items.push(...extractor.push(chunk));
  return { items, done: extractor.done };
}

describe('createArrayItemExtractor', () => {
  it('emits each item of the root array, parseable, in order', () => {
    const { items, done } = feedAll([DOC]);
    expect(items.map((s) => JSON.parse(s))).toEqual([REQ_A, REQ_B, REQ_C]);
    expect(done).toBe(true);
  });

  it('gives the same result when split into two chunks at EVERY position', () => {
    for (let at = 0; at <= DOC.length; at++) {
      const { items } = feedAll([DOC.slice(0, at), DOC.slice(at)]);
      expect(items.map((s) => JSON.parse(s)), `split at ${at}`).toEqual([REQ_A, REQ_B, REQ_C]);
    }
  });

  it('gives the same result one character at a time', () => {
    const { items } = feedAll(DOC.split(''));
    expect(items.map((s) => JSON.parse(s))).toEqual([REQ_A, REQ_B, REQ_C]);
  });

  it('emits an item as soon as its closing brace arrives, not later', () => {
    const extractor = createArrayItemExtractor('requirements');
    let emittedAt = -1;
    for (let i = 0; i < DOC.length; i++) {
      if (extractor.push(DOC[i]).length > 0) {
        emittedAt = i;
        break;
      }
    }
    const prefix = DOC.slice(0, emittedAt + 1);
    expect(prefix.endsWith('}')).toBe(true);
    // The document so far must contain exactly one complete requirement.
    expect(prefix.includes('Nested')).toBe(false);
  });

  it('handles escaped quotes and a backslash right before a quote', () => {
    const tricky = { text: 'ends with backslash \\', priority: 'must', skills: [], otherSkills: ['say "hi"'], minYears: null };
    const doc = JSON.stringify({ role: 'x', requirements: [tricky, REQ_B] });
    for (let at = 0; at <= doc.length; at++) {
      const { items } = feedAll([doc.slice(0, at), doc.slice(at)]);
      expect(items.map((s) => JSON.parse(s))).toEqual([tricky, REQ_B]);
    }
  });

  it('ignores a same-named key nested below the root', () => {
    const doc = JSON.stringify({
      meta: { requirements: [{ decoy: true }] },
      role: 'requirements',
      requirements: [REQ_A],
    });
    expect(feedAll([doc]).items.map((s) => JSON.parse(s))).toEqual([REQ_A]);
  });

  it('does not treat a string VALUE equal to the key as the key', () => {
    const doc = '{"role": "requirements", "other": [{"no": 1}], "requirements": [{"yes": 1}]}';
    expect(feedAll([doc]).items).toEqual(['{"yes": 1}']);
  });

  it('skips leading text and ignores trailing garbage after the root closes', () => {
    const doc = '```json\n' + JSON.stringify({ role: 'r', requirements: [REQ_A] }) + '\n```{"requirements":[{"x":1}]}';
    const { items, done } = feedAll(doc.split(''));
    expect(items.map((s) => JSON.parse(s))).toEqual([REQ_A]);
    expect(done).toBe(true);
  });

  it('emits nothing for an empty array and nothing for an unterminated item', () => {
    expect(feedAll(['{"role":"r","requirements":[]}']).items).toEqual([]);
    const partial = feedAll(['{"role":"r","requirements":[{"text":"half']);
    expect(partial.items).toEqual([]);
    expect(partial.done).toBe(false);
  });

  it('supports primitive and nested-array items', () => {
    const doc = '{"requirements": [1, "a,]b", [2, [3]], true , null]}';
    expect(feedAll(doc.split('')).items).toEqual(['1', '"a,]b"', '[2, [3]]', 'true', 'null']);
  });

  it('is linear: a 15-item document char-by-char stays fast', () => {
    const doc = JSON.stringify({ role: 'r', requirements: Array.from({ length: 15 }, () => REQ_A) });
    const t0 = performance.now();
    const { items } = feedAll(doc.split(''));
    expect(items).toHaveLength(15);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
