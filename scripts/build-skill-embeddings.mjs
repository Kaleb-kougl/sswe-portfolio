#!/usr/bin/env node
/**
 * Builds src/lib/fit/embed/skill-embeddings.json: the embedding matcher's
 * vocabulary vectors (plan 2f, item 6).
 *
 * Embeds every `vocabularyEntries(SKILLS_TABLE)` text with `EMBED_MODEL`
 * (transformers.js on onnxruntime-node, the pinned revision, q8), quantizes
 * each unit vector to int8 with its own scale, and writes them with
 * `vocabularyHash`. __tests__/fit/embed.test.ts recomputes the hash, so a
 * vocabulary or model change without a rebuild fails the unit tests.
 *
 * Usage: node scripts/build-skill-embeddings.mjs   (Node ≥ 23: loads the
 * .ts sources with built-in type stripping)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { pipeline } from '@huggingface/transformers';

import { SKILLS_TABLE } from '../src/data/corpus/skills.ts';
import { EMBED_MODEL, quantizeRows, vocabularyEntries, vocabularyHash } from '../src/lib/fit/embed/vocabulary.ts';

const OUT = path.join(process.cwd(), 'src/lib/fit/embed/skill-embeddings.json');

const entries = vocabularyEntries(SKILLS_TABLE);
const extractor = await pipeline('feature-extraction', EMBED_MODEL.id, {
  revision: EMBED_MODEL.revision,
  dtype: EMBED_MODEL.dtype,
});
// One text per call: q8 quantizes activations per tensor, so batching would
// make each vector depend on its batch-mates (and differ from the browser's).
const rows = [];
for (const { text } of entries) {
  const tensor = await extractor([text], { pooling: EMBED_MODEL.pooling, normalize: true });
  rows.push(Float32Array.from(tensor.data));
}
const n = rows.length;
const dims = rows[0].length;
if (dims !== EMBED_MODEL.dims) throw new Error(`Expected ${EMBED_MODEL.dims} dims, got ${dims}`);
const { scales, bytes } = quantizeRows(rows);

const file = {
  model: {
    id: EMBED_MODEL.id,
    revision: EMBED_MODEL.revision,
    dtype: EMBED_MODEL.dtype,
    pooling: EMBED_MODEL.pooling,
    dims,
  },
  hash: vocabularyHash(entries, EMBED_MODEL),
  entries,
  scales: scales.map((s) => +s.toPrecision(6)),
  vectors: Buffer.from(bytes.buffer).toString('base64'),
};
writeFileSync(OUT, JSON.stringify(file) + '\n');
console.log(`${path.relative(process.cwd(), OUT)}: ${n} entries × ${dims} dims, hash ${file.hash}`);
