import { z } from 'zod';

import { CORPUS } from '@/data/corpus';

import { defineTool } from './types';

export const getCorpus = defineTool({
  name: 'get_corpus',
  title: 'Get the full evidence corpus',
  description:
    'Everything this server knows about Kaleb Kougl’s work in one JSON document (well under 8k tokens): the profile, the skill vocabulary with aliases, and every evidence record. Each record is one first-person claim with its canonical skill tags, an optional metric, a period and a source link. ' +
    'Use this to compare Kaleb’s work to a job description or to run your own fit check: go requirement by requirement, cite evidence ids (e.g. "indeed-sr-swe.onehost-lead") and their source links for every claim you make, and say plainly when a requirement has no matching evidence rather than inferring one. ' +
    'For a single skill or question, search_evidence is cheaper.',
  inputSchema: z.object({}),
  handler: () => CORPUS,
});
