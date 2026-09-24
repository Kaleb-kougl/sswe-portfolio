import { describe, expect, it } from 'vitest';

import { SKILLS_TABLE } from '@/data/corpus/skills';
import {
  acceptsPhrase,
  decodeVocabulary,
  EMBED_PARAMS,
  extractPhrases,
  extractSpans,
  isTermFragment,
  matchSegment,
  normalize,
  scorePhrase,
  stem,
  type PhraseScore,
  type Vocabulary,
} from '@/lib/fit/embed';
import committed from '@/lib/fit/embed/skill-embeddings.json';
import {
  BACKGROUND_SKILL,
  EMBED_MODEL,
  quantizeRows,
  vocabularyEntries,
  vocabularyHash,
  type SkillEmbeddingsFile,
} from '@/lib/fit/embed/vocabulary';

import { NEGATIVES } from '../../evals/embed/cases';

const file = committed as SkillEmbeddingsFile;

describe('skill-embeddings.json staleness', () => {
  it('was built from the current vocabulary and model (rebuild: node scripts/build-skill-embeddings.mjs)', () => {
    const entries = vocabularyEntries(SKILLS_TABLE);
    expect(file.entries).toEqual(entries);
    expect(file.model).toEqual({
      id: EMBED_MODEL.id,
      revision: EMBED_MODEL.revision,
      dtype: EMBED_MODEL.dtype,
      pooling: EMBED_MODEL.pooling,
      dims: EMBED_MODEL.dims,
    });
    expect(file.hash).toBe(vocabularyHash(entries, EMBED_MODEL));
  });

  it('changes hash when the vocabulary or the model changes', () => {
    const entries = vocabularyEntries(SKILLS_TABLE);
    const base = vocabularyHash(entries, EMBED_MODEL);
    expect(vocabularyHash([...entries, { skill: 'react', text: 'React.js' }], EMBED_MODEL)).not.toBe(base);
    expect(vocabularyHash(entries, { ...EMBED_MODEL, revision: 'main' })).not.toBe(base);
  });

  it('decodes to one unit vector per entry', () => {
    const vocab = decodeVocabulary(file);
    expect(vocab.vectors).toHaveLength(file.entries.length);
    for (const v of vocab.vectors) {
      expect(v).toHaveLength(EMBED_MODEL.dims);
      expect(Math.hypot(...v)).toBeCloseTo(1, 5);
    }
  });

  it('covers every canonical skill, plus background senses that are never skills', () => {
    const skills = new Set(file.entries.map((e) => e.skill));
    for (const s of SKILLS_TABLE) expect(skills.has(s.id), s.id).toBe(true);
    expect(skills.has(BACKGROUND_SKILL)).toBe(true);
  });

  it('int8 round trip keeps cosine similarity to within 0.01', () => {
    const rows = [normalize(Float32Array.from({ length: 384 }, (_, i) => Math.sin(i))), normalize(Float32Array.from({ length: 384 }, (_, i) => Math.cos(i * 1.3)))];
    const { scales, bytes } = quantizeRows(rows);
    const vocab = decodeVocabulary({
      ...file,
      entries: [
        { skill: 'a', text: 'a' },
        { skill: 'b', text: 'b' },
      ],
      model: { ...file.model, dims: 384 },
      scales,
      vectors: Buffer.from(bytes.buffer).toString('base64'),
    });
    const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
    expect(Math.abs(dot(vocab.vectors[0], vocab.vectors[1]) - dot(rows[0], rows[1]))).toBeLessThan(0.01);
  });
});

describe('phrase extraction', () => {
  it('takes 1–4 word n-grams that neither start nor end on a stopword', () => {
    const phrases = extractPhrases('Designing and building REST APIs');
    expect(phrases).toEqual(expect.arrayContaining(['REST', 'REST APIs', 'APIs', 'building REST APIs']));
    expect(phrases).not.toContain('and');
    expect(phrases.some((p) => /^(?:and|the|of)\b|\b(?:and|the|of)$/i.test(p))).toBe(false);
    expect(phrases.every((p) => p.split(' ').length <= 4)).toBe(true);
  });

  it('never crosses a conjunction or clause punctuation', () => {
    const phrases = extractPhrases('Mentor engineers and lead technical design reviews');
    expect(phrases).not.toContain('engineers and lead');
    expect(extractPhrases('screen readers, keyboard navigation')).not.toContain('readers keyboard');
    expect(extractPhrases('Coached (and grew) engineers')).not.toContain('Coached and grew');
  });

  it('drops numbers, and phrases the alias scan already recognises', () => {
    const phrases = extractPhrases('5+ years with GraphQL APIs and Kubernetes');
    expect(phrases).not.toContain('5+');
    expect(phrases.filter((p) => /graphql|kubernetes/i.test(p))).toEqual([]);
    expect(phrases).toContain('APIs');
  });

  it('keeps inflections and synonyms, drops bare pieces of vocabulary terms', () => {
    expect(extractPhrases("You've mentored junior developers")).toContain('mentored');
    expect(extractPhrases('Building for screen readers')).toContain('screen readers');
    const trap = extractPhrases('Testing the waters with new design ideas');
    expect(trap).not.toContain('Testing');
    expect(trap).not.toContain('design');
    expect(extractPhrases('Designing systems')).not.toContain('Designing');
  });

  it('returns word spans that line up with the words', () => {
    const { words, spans } = extractSpans('Build and maintain REST APIs, with care.');
    for (const s of spans) expect(words.slice(s.start, s.end).join(' ')).toBe(s.phrase);
  });

  it('never offers a found skill or gap term on the negative lines', () => {
    // The model-level guarantee (no add on any negative) is the eval's
    // (evals/embed/sweep.eval.ts); here: the scan's findings never reach it.
    expect(extractPhrases('Kubernetes and Terraform')).toEqual([]);
    expect(extractPhrases('Go and Rust services').filter((p) => /\b(?:go|rust)\b/i.test(p))).toEqual([]);
    expect(extractPhrases('Experience with React Native and Expo').filter((p) => /react|native/i.test(p))).toEqual([]);
    for (const line of NEGATIVES) {
      for (const p of extractPhrases(line)) expect(isTermFragment(p), `${p} in "${line}"`).toBe(false);
    }
  });
});

describe('isTermFragment / stem', () => {
  it('flags words that only appear inside a longer vocabulary term', () => {
    for (const p of ['design', 'Testing', 'agents', 'lead', 'Designing', 'research']) expect(isTermFragment(p), p).toBe(true);
    for (const p of ['mentored', 'APIs', 'screen readers', 'Mentor', 'tests']) expect(isTermFragment(p), p).toBe(false);
  });

  it('strips verb endings only', () => {
    expect(stem('designing')).toBe('design');
    expect(stem('mapping')).toBe('map');
    expect(stem('migrated')).toBe('migrat');
    expect(stem('APIs')).toBe('apis');
    expect(stem('tests')).toBe('tests');
  });
});

describe('margin rule', () => {
  const unit = (...xs: number[]) => normalize(Float32Array.from(xs));
  const vocab: Vocabulary = {
    dims: 3,
    entries: [
      { skill: 'mentoring', text: 'Mentoring' },
      { skill: 'mentoring', text: 'mentorship' },
      { skill: 'tech-leadership', text: 'tech lead' },
      { skill: BACKGROUND_SKILL, text: 'sales coaching' },
    ],
    vectors: [unit(1, 0, 0), unit(0.9, 0.1, 0), unit(0.8, 0.6, 0), unit(0, 0, 1)],
  };

  it("scores a phrase's runner-up as the next SKILL, not the same skill's other text", () => {
    const s = scorePhrase('mentored', unit(1, 0, 0), vocab);
    expect(s.skill).toBe('mentoring');
    expect(s.runnerUpSkill).toBe('tech-leadership');
    expect(s.score).toBeCloseTo(1);
    expect(s.runnerUp).toBeCloseTo(0.8);
  });

  const score = (over: Partial<PhraseScore>): PhraseScore => ({
    phrase: 'p',
    skill: 'mentoring',
    score: 0.8,
    runnerUp: 0.5,
    runnerUpSkill: 'tech-leadership',
    via: 'Mentoring',
    ...over,
  });
  const params = { tau: 0.6, margin: 0.1, tauContext: 0.5, maxPerSegment: 3 };

  it('needs both the threshold and the margin', () => {
    expect(acceptsPhrase(score({}), params)).toBe(true);
    expect(acceptsPhrase(score({ score: 0.59 }), params)).toBe(false);
    expect(acceptsPhrase(score({ runnerUp: 0.75 }), params)).toBe(false);
  });

  it('never adds a found skill or a background sense, and checks the segment context', () => {
    expect(matchSegment([score({})], ['mentoring'], params)).toEqual([]);
    expect(matchSegment([score({ skill: BACKGROUND_SKILL })], [], params)).toEqual([]);
    expect(matchSegment([score({})], [], params, { mentoring: 0.4 })).toEqual([]);
    expect(matchSegment([score({})], [], params, { mentoring: 0.6 }).map((a) => a.skill)).toEqual(['mentoring']);
  });

  it('keeps each skill once, strongest first, at most maxPerSegment', () => {
    const adds = matchSegment(
      [
        score({ skill: 'a', score: 0.7 }),
        score({ skill: 'b', score: 0.9 }),
        score({ skill: 'a', score: 0.75, phrase: 'better' }),
        score({ skill: 'c', score: 0.8 }),
        score({ skill: 'd', score: 0.65 }),
      ],
      [],
      params,
    );
    expect(adds.map((a) => [a.skill, a.score])).toEqual([
      ['b', 0.9],
      ['c', 0.8],
      ['a', 0.75],
    ]);
  });

  it('ships a precision-first default', () => {
    expect(EMBED_PARAMS.maxPerSegment).toBeLessThanOrEqual(3);
    expect(EMBED_PARAMS.tau).toBeGreaterThan(0);
  });
});
