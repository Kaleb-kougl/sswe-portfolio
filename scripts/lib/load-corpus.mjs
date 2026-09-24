/**
 * Imports the validated corpus from src/data/corpus into a plain Node script.
 * Importing it runs the Zod parse, so bad data fails here exactly as it would
 * in `next build`.
 */
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);

export async function loadCorpus() {
  const { CORPUS } = await import('../../src/data/corpus/index.ts');
  return CORPUS;
}
