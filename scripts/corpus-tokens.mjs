#!/usr/bin/env node
/**
 * Prints the serialized corpus size against its token budget.
 *
 * WHY A BUDGET: `get_corpus` hands the whole thing to a calling agent, and the
 * fit checker puts it in every prompt. Both get worse and dearer as it grows,
 * so growth should be a decision, not a drift.
 *
 * The estimate is characters / 4, which is offline and deterministic. It is a
 * rough ratio for English prose; JSON punctuation tends to tokenize a little
 * worse, so treat a reading near the limit as over it.
 *
 * Exit codes: 0 within budget, 1 over it.
 */
import { loadCorpus } from './lib/load-corpus.mjs';

const BUDGET_TOKENS = 8000;

const corpus = await loadCorpus();
const json = JSON.stringify(corpus);
const tokens = Math.ceil(json.length / 4);

console.log(`corpus: ${corpus.evidence.length} evidence records, ${corpus.skills.length} skills`);
console.log(`serialized: ${json.length.toLocaleString('en-US')} chars, ~${tokens.toLocaleString('en-US')} tokens (chars/4)`);
console.log(`budget: ${BUDGET_TOKENS.toLocaleString('en-US')} tokens, ${Math.round((tokens / BUDGET_TOKENS) * 100)}% used`);

if (tokens > BUDGET_TOKENS) {
  console.error(`FAIL: corpus is over budget by ~${(tokens - BUDGET_TOKENS).toLocaleString('en-US')} tokens`);
  process.exit(1);
}
