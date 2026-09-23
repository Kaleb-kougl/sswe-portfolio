import { describe, expect, it } from 'vitest';

import { CORPUS } from '@/data/corpus';
import { Corpus } from '@/data/corpus/schema';
import { runTool } from '@/lib/tools';
import { getCorpus } from '@/lib/tools/get-corpus';

import { PHONE } from './helpers';

describe('get_corpus', () => {
  it('returns the whole validated corpus', () => {
    const corpus = runTool('get_corpus');
    expect(corpus).toBe(CORPUS);
    expect(() => Corpus.parse(corpus)).not.toThrow();
  });

  it('tells the model to cite evidence ids and source links', () => {
    expect(getCorpus.description).toMatch(/job description/i);
    expect(getCorpus.description).toMatch(/cite evidence ids/i);
    expect(getCorpus.description).toMatch(/source links/i);
  });

  it('stays inside the 8k-token budget (chars / 4)', () => {
    expect(JSON.stringify(runTool('get_corpus')).length / 4).toBeLessThan(8000);
  });

  it('never returns the phone number', () => {
    expect(JSON.stringify(runTool('get_corpus'))).not.toMatch(PHONE);
  });
});
