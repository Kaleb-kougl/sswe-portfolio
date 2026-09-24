import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

import { normalize, type EmbedFn, type SpanEmbedFn } from '@/lib/fit/embed';

/**
 * transformers.js in Node (onnxruntime-node, CPU) as an `EmbedFn`. The
 * browser uses the same library on WASM; the eval checks both give the
 * same decisions on the fixtures (see the browser section of the results).
 */

export interface CandidateModel {
  id: string;
  revision: string;
  pooling: 'mean' | 'cls';
  /** Size of the q8 ONNX file, from the Hub API. */
  onnxBytes: number;
  license: string;
  /** Prepended to every text (none of the candidates needs one for symmetric similarity). */
  prefix?: string;
}

if (process.env.EMBED_CACHE_DIR) env.cacheDir = process.env.EMBED_CACHE_DIR;

export async function nodeEmbedder(model: CandidateModel): Promise<{ embed: EmbedFn; spanEmbed: SpanEmbedFn; loadMs: number }> {
  const t0 = performance.now();
  const extractor = (await pipeline('feature-extraction', model.id, {
    revision: model.revision,
    dtype: 'q8',
  })) as FeatureExtractionPipeline;
  const loadMs = performance.now() - t0;
  const embed: EmbedFn = async (texts) => {
    const out: Float32Array[] = [];
    // One text per call: the q8 models quantize activations dynamically,
    // per tensor, so a batch-mate's values would change this text's vector.
    for (let i = 0; i < texts.length; i += 1) {
      const batch = texts.slice(i, i + 1).map((t) => (model.prefix ?? '') + t);
      const tensor = await extractor(batch, { pooling: model.pooling, normalize: true });
      const [n, dims] = tensor.dims as [number, number];
      const data = tensor.data as Float32Array;
      for (let r = 0; r < n; r++) out.push(normalize(Float32Array.from(data.subarray(r * dims, (r + 1) * dims))));
    }
    return out;
  };
  const tokenizer = extractor.tokenizer;
  const spanEmbed: SpanEmbedFn = async (words, spans) => {
    // Word i's tokens start after [CLS] and every earlier word's pieces.
    const starts: number[] = [];
    let t = 1;
    for (const w of words) {
      starts.push(t);
      t += (tokenizer.encode(w, { add_special_tokens: false }) as number[]).length;
    }
    starts.push(t);
    const tensor = await extractor(words.join(' '), { pooling: 'none', normalize: false });
    const [, tokens, dims] = tensor.dims as [number, number, number];
    if (tokens !== t + 1) throw new Error(`token count ${tokens} ≠ ${t + 1} for "${words.join(' ')}"`);
    const data = tensor.data as Float32Array;
    return spans.map(([a, b]) => {
      const v = new Float32Array(dims);
      for (let k = starts[a]; k < starts[b]; k++) for (let d = 0; d < dims; d++) v[d] += data[k * dims + d];
      return normalize(v);
    });
  };
  return { embed, spanEmbed, loadMs };
}
