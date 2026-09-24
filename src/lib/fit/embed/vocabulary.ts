/**
 * THE EMBEDDING MATCHER'S VOCABULARY (plan 2f, item 6).
 *
 * What each canonical skill looks like to the embedding model: its label,
 * its id read as words, and its aliases, minus the ones that would only add
 * noise (see `EMBED_SKIP_ALIASES`). `scripts/build-skill-embeddings.mjs`
 * embeds these texts once and commits the vectors to
 * `skill-embeddings.json`, together with `vocabularyHash` of the texts and
 * the model. A unit test recomputes the hash, so editing `SKILLS_TABLE`, an
 * alias, a description or the model without rebuilding fails CI.
 *
 * No runtime imports on purpose: the build script loads this file with
 * Node's type stripping, which can't resolve the `@/` alias.
 */

/** The shape of a `SKILLS_TABLE` row this file needs (kept structural, see above). */
export interface VocabularySkill {
  id: string;
  label: string;
  aliases: readonly string[];
}

/** The sentence-embedding model. Pinned by revision; the vectors are only valid for it. */
export interface EmbedModel {
  /** Hugging Face repo id, as transformers.js loads it. */
  id: string;
  /** The exact commit the vectors were built from. */
  revision: string;
  /** transformers.js `dtype`: `q8` is the 8-bit quantized ONNX file. */
  dtype: 'q8' | 'fp16' | 'fp32';
  pooling: 'mean' | 'cls';
  dims: number;
  /** Bytes the browser downloads: the ONNX file plus tokenizer and configs. */
  downloadBytes: number;
  license: string;
}

/**
 * The model the committed vectors are for: all-MiniLM-L6-v2, 8-bit ONNX.
 * `evals/embed/sweep.eval.ts` compared eight small encoders on the
 * development data; this one tied mxbai-embed-xsmall for the best recall
 * at zero wrong adds, at 23 MB, Apache-2.0. See `evals/embed/results/`.
 */
export const EMBED_MODEL: EmbedModel = {
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  dtype: 'q8',
  pooling: 'mean',
  dims: 384,
  // onnx/model_quantized.onnx 22,972,370 B + tokenizer.json 711,661 B + configs 1,016 B
  downloadBytes: 23_685_047,
  license: 'apache-2.0',
};

/**
 * Aliases left out of the embedding vocabulary:
 * - short abbreviations ("ts", "di", "fp", "mfe"): a phrase that spells one
 *   is already found by the alias scan, and a 2–3 letter string embeds close
 *   to unrelated short words;
 * - the scan's stop terms ("research", "agents", "testing", "coaching",
 *   "motion", "three", "architecture", …): they are ambiguous in a JD, which
 *   is exactly why the scan won't match them bare. As embedding targets they
 *   would pull "user research" to scientific-research.
 */
export const EMBED_SKIP_ALIASES: ReadonlySet<string> = new Set([
  'three',
  'research',
  'agents',
  'architecture',
  'testing',
  'performance optimization',
  'motion',
  'coaching',
  'apollo',
  'migrations',
  'parsing',
  'roblox',
  'npm',
]);

/**
 * Optional one-line descriptions, embedded as extra targets for a skill.
 * Added only where the eval showed they recover a real miss without
 * breaking a negative; everything else stays name-and-alias only.
 */
export const SKILL_DESCRIPTIONS: Readonly<Record<string, readonly string[]>> = {};

/**
 * BACKGROUND SENSES: everyday meanings of words the vocabulary uses, as
 * extra targets that belong to no skill (id `__background`). A phrase
 * nearest one of these is never added, and one close to both a skill and a
 * background sense fails the margin rule — "motion graphics" sits nearer
 * video work than UI animation. Written from the vocabulary's own words
 * (design, animation, research, architecture, testing, agents, delivery,
 * security, tokens, performance, state, platform, data, components,
 * quality, games, migration, pipelines, leads, coaching), not from any
 * labelled JD.
 */
export const BACKGROUND_SENSES: readonly string[] = [
  'graphic design',
  'brand design and visual identity',
  'interior design',
  'fashion design',
  'design thinking workshops',
  'video production and motion graphics',
  'animated video content for social media',
  'user research and interviews',
  'market research',
  'academic science degree',
  'building architecture and construction',
  'information architecture for content',
  'A/B testing marketing campaigns',
  'testing new ideas and experiments',
  'customer support agents',
  'real estate and insurance agents',
  'project delivery and client commitments',
  'food delivery and logistics',
  'security guard and physical security',
  'government security clearance',
  'cryptocurrency tokens and trading',
  'performance marketing and paid ads',
  'employee performance reviews',
  'state and local government',
  'social media platforms',
  'data entry and spreadsheets',
  'hardware components and manufacturing',
  'quality assurance in manufacturing',
  'game theory and economics',
  'data migration of customer records',
  'sales pipeline and leads',
  'sales coaching and quotas',
  'account management and customer relationships',
  'financial planning and analysis',
  'supply chain and operations',
];

export const BACKGROUND_SKILL = '__background';

export interface VocabularyEntry {
  skill: string;
  text: string;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every text the matcher compares a JD phrase against, deduplicated per skill. */
export function vocabularyEntries(skills: readonly VocabularySkill[]): VocabularyEntry[] {
  const out: VocabularyEntry[] = [];
  for (const skill of skills) {
    const seen = new Set<string>();
    const texts = [skill.label, skill.id.replace(/-/g, ' '), ...skill.aliases, ...(SKILL_DESCRIPTIONS[skill.id] ?? [])];
    for (const text of texts) {
      const k = key(text);
      if (!k || seen.has(k)) continue;
      if (EMBED_SKIP_ALIASES.has(text.toLowerCase())) continue;
      // Short abbreviations; the label itself always stays ("CSS", "AWS").
      if (text !== skill.label && k.replace(/ /g, '').length <= 3) continue;
      seen.add(k);
      out.push({ skill: skill.id, text });
    }
  }
  for (const text of BACKGROUND_SENSES) out.push({ skill: BACKGROUND_SKILL, text });
  return out;
}

/**
 * cyrb53: a small, fast, well-mixed 53-bit string hash. Not cryptographic;
 * it only has to notice that the vocabulary or the model changed. Pure JS, so
 * the build script, the unit test and the browser agree on it.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The staleness key committed next to the vectors: model + every entry, in order. */
export function vocabularyHash(entries: readonly VocabularyEntry[], model: EmbedModel): string {
  const payload = JSON.stringify({
    model: [model.id, model.revision, model.dtype, model.pooling, model.dims],
    entries: entries.map((e) => [e.skill, e.text]),
  });
  return `${cyrb53(payload).toString(16).padStart(14, '0')}${cyrb53(payload, 1).toString(16).padStart(14, '0')}`;
}

/** The committed file (`skill-embeddings.json`). */
export interface SkillEmbeddingsFile {
  model: { id: string; revision: string; dtype: string; pooling: string; dims: number };
  hash: string;
  entries: VocabularyEntry[];
  /** Per-entry scale: value = int8 × scale. */
  scales: number[];
  /** base64 of an Int8Array, entries × dims, row-major. */
  vectors: string;
}

/** int8 per-row quantization of unit vectors (the file stays ~130 KB). */
export function quantizeRows(rows: readonly ArrayLike<number>[]): { scales: number[]; bytes: Int8Array } {
  const dims = rows[0]?.length ?? 0;
  const bytes = new Int8Array(rows.length * dims);
  const scales: number[] = [];
  rows.forEach((row, r) => {
    let max = 0;
    for (let i = 0; i < dims; i++) max = Math.max(max, Math.abs(row[i]));
    const scale = max / 127 || 1;
    scales.push(scale);
    for (let i = 0; i < dims; i++) bytes[r * dims + i] = Math.round(row[i] / scale);
  });
  return { scales, bytes };
}
