/**
 * WHICH MODEL PRIVATE MODE RUNS, and the numbers the gate and the benchmark
 * need about it. Plain data: safe to import from the main thread (the client
 * reads sizes for the consent dialog and the storage check) without pulling
 * in WebLLM.
 *
 * The model is chosen by the Phase 3 evals; until then the default is the
 * smallest shortlisted model. Every WebLLM LLM supports JSON-schema decoding
 * (XGrammar, `response_format: { type: 'json_object', schema }` has no model
 * whitelist in @mlc-ai/web-llm 0.2.85), so "smallest" is the only criterion.
 *
 * Sizes are the sum of the `params_shard_*` files in each Hugging Face repo at
 * the pinned revision (https://huggingface.co/api/models/mlc-ai/<id>?blobs=true,
 * read 2026-09-23). `vramMB` is `vram_required_MB` from WebLLM 0.2.85's
 * `prebuiltAppConfig`. Architecture numbers are from each model's
 * `config.json`.
 */

export interface LocalModel {
  /** WebLLM model id, as in `prebuiltAppConfig.model_list`. */
  id: string;
  /** Hugging Face repo. */
  repo: string;
  /** Pinned commit of `repo`; the weights URL resolves to exactly this. */
  revision: string;
  /** Bytes of weight shards downloaded on first use. */
  downloadBytes: number;
  vramMB: number;
  /** Transformer width; the benchmark's matmul is shaped like it. */
  hiddenSize: number;
  layers: number;
  /**
   * Parameters touched per token excluding the embedding lookup (the LM head
   * is included where it is tied). Used for prefill FLOPs.
   */
  activeParams: number;
  /** `q4f16_1` kernels use f16 arithmetic: the adapter must expose `shader-f16`. */
  needsShaderF16: boolean;
  /**
   * Smallest `maxStorageBufferBindingSize` we accept. WebLLM itself falls back
   * to 128 MiB but warns that only 1k-context models fit there; the largest
   * single tensors of these models (4-bit embedding table, 4k-token paged KV
   * cache) are 117–134 MB, so 256 MiB is the conservative floor.
   */
  minStorageBufferBindingBytes: number;
  /** WebLLM needs at least 256 MiB (it asks for 1 GiB and falls back). */
  minBufferBytes: number;
  /** Extra request fields the model family needs (Qwen3: thinking off). */
  extraBody?: Record<string, unknown>;
}

const MiB = 1024 * 1024;

export const LOCAL_MODELS = {
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    repo: 'mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC',
    revision: '2a37b0a5ecb622d51ddc2fac74de0b95872affd7',
    downloadBytes: 695_242_752,
    vramMB: 879,
    hiddenSize: 2048,
    layers: 16,
    activeParams: 1_236_000_000,
    needsShaderF16: true,
    minStorageBufferBindingBytes: 256 * MiB,
    minBufferBytes: 256 * MiB,
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    repo: 'mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    revision: '9bd564b064631febf14deadcac492efb761d60c3',
    downloadBytes: 868_547_584,
    vramMB: 1630,
    hiddenSize: 1536,
    layers: 28,
    activeParams: 1_544_000_000,
    needsShaderF16: true,
    minStorageBufferBindingBytes: 256 * MiB,
    minBufferBytes: 256 * MiB,
  },
  'Qwen3-1.7B-q4f16_1-MLC': {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    repo: 'mlc-ai/Qwen3-1.7B-q4f16_1-MLC',
    revision: '80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc',
    downloadBytes: 968_001_536,
    vramMB: 2037,
    hiddenSize: 2048,
    layers: 28,
    activeParams: 1_720_000_000,
    needsShaderF16: true,
    minStorageBufferBindingBytes: 256 * MiB,
    minBufferBytes: 256 * MiB,
    extraBody: { enable_thinking: false },
  },
} as const satisfies Record<string, LocalModel>;

export type LocalModelId = keyof typeof LOCAL_MODELS;

/**
 * THE model. One constant, so the evals can swap it in one line. Smallest of
 * the shortlist: 695 MB download, 879 MB VRAM.
 */
export const LOCAL_MODEL_ID: LocalModelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export const LOCAL_MODEL: LocalModel = LOCAL_MODELS[LOCAL_MODEL_ID];

/** The pinned weights URL WebLLM should fetch from (`…/resolve/<sha>/`). */
export function weightsUrl(model: LocalModel): string {
  return `https://huggingface.co/${model.repo}/resolve/${model.revision}/`;
}

/** "695 MB", for the consent dialog. Decimal megabytes, like download UIs. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}
