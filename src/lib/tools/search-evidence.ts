import { z } from 'zod';

import { CORPUS, normalizeSkill, type Evidence } from '@/data/corpus';

import { ToolInputError, defineTool } from './types';

/**
 * Keyword + alias search, no embeddings. Two signals, added together:
 *
 *   - skill tags (weight 3 each): every requested skill, plus any 1–3 word run
 *     of the query that is a skill or alias ("module federation", "a11y"),
 *     normalized to its canonical tag and matched against a record's tags;
 *   - keywords (weight 1 each): query words, minus stop words, found in the
 *     record's claim, metric or skill names. A word of 4+ letters also matches
 *     as a prefix, so "migrate" finds "migration".
 *
 * Ties keep corpus order, which is newest role first.
 */

const TAG_WEIGHT = 3;
const MAX_PHRASE_WORDS = 3;

const STOP_WORDS = new Set(
  'a an and any are as at be by can did do does for from has have he his how i in is it its me my of on or our that the their them this to was what when where which who why with you your kaleb kougl worked work experience'.split(
    ' ',
  ),
);

const LABELS = new Map(CORPUS.skills.map((s) => [s.id, s.label]));

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Canonical tags named anywhere in the query, longest phrase first. */
function tagsInQuery(queryWords: string[]): string[] {
  const tags = new Set<string>();
  for (let n = Math.min(MAX_PHRASE_WORDS, queryWords.length); n >= 1; n--) {
    for (let i = 0; i + n <= queryWords.length; i++) {
      const tag = normalizeSkill(queryWords.slice(i, i + n).join(' '));
      if (tag) tags.add(tag);
    }
  }
  return [...tags];
}

function searchableWords(e: Evidence): string[] {
  return words([e.claim, e.metric ?? '', ...e.skills, ...e.skills.map((s) => LABELS.get(s) ?? '')].join(' '));
}

function keywordHit(keyword: string, text: readonly string[]): boolean {
  return text.some((w) => w === keyword || (keyword.length >= 4 && w.startsWith(keyword)));
}

export const searchEvidence = defineTool({
  name: 'search_evidence',
  title: 'Search Kaleb Kougl’s evidence',
  description:
    'Finds evidence records (single sourced claims about Kaleb Kougl’s work) by skill and/or keywords, ranked best first. ' +
    'Use it to answer "has Kaleb done X?" or to back one requirement from a job description. ' +
    'Pass `skills` for technologies or practices; aliases are understood ("mfe" → module-federation, "a11y" → wcag, "r3f" → react-three-fiber). Pass `query` for free text; skill names inside it are recognised too. ' +
    'Each result carries an id, the claim, its skills, an optional metric and a source link: cite the id and link when you repeat a claim. ' +
    'No results means no evidence in the corpus, which is an honest gap; do not fill it in. `interpretedAs` shows how your input was read, including skills the corpus does not know.',
  inputSchema: z.object({
    skills: z
      .array(z.string().min(1).max(100))
      .max(20)
      .optional()
      .describe('Skills or aliases, e.g. ["module federation", "react"] or ["mfe"].'),
    query: z
      .string()
      .max(500)
      .optional()
      .describe('Free-text keywords, e.g. "cut bundle size" or "accessibility across shared components".'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum results (default 10).'),
  }),
  handler: ({ skills = [], query = '', limit = 10 }) => {
    const queryWords = words(query);
    if (skills.length === 0 && queryWords.length === 0) {
      throw new ToolInputError('Pass `skills` (e.g. ["mfe"]), a `query` (e.g. "bundle size"), or both.');
    }

    const requested = skills.map((s) => ({ input: s, tag: normalizeSkill(s) }));
    const tags = new Set([
      ...requested.flatMap((r) => (r.tag ? [r.tag] : [])),
      ...tagsInQuery(queryWords),
    ]);
    const keywords = [...new Set(queryWords.filter((w) => !STOP_WORDS.has(w) && w.length > 1))];

    const ranked = CORPUS.evidence
      .map((e) => {
        const text = searchableWords(e);
        const matchedSkills = e.skills.filter((s) => tags.has(s));
        const matchedKeywords = keywords.filter((k) => keywordHit(k, text));
        return { e, matchedSkills, score: matchedSkills.length * TAG_WEIGHT + matchedKeywords.length };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      interpretedAs: {
        skills: [...tags],
        unknownSkills: requested.filter((r) => !r.tag).map((r) => r.input),
        keywords,
      },
      total: ranked.length,
      results: ranked.slice(0, limit).map(({ e, matchedSkills, score }) => ({
        ...e,
        score,
        matchedSkills,
      })),
    };
  },
});
