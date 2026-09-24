import type { LocalModel } from './model';

/**
 * MODELS FOR MEASUREMENT SPIKES ONLY (evals/chat). The worker can load them
 * by id like any LOCAL_MODELS entry, but no page imports this file, so they
 * never reach a page bundle, the gate or the consent dialog.
 */

const MiB = 1024 * 1024;

export const SPIKE_MODELS = {
  /**
   * Added for the on-device chat faithfulness spike (evals/chat), the one
   * ~3B model it tries. Llama rather than Qwen2.5-3B because Qwen2.5-3B is
   * under the Qwen Research licence (non-commercial), while Llama 3.2 3B
   * shares the licence of the 1B already listed. Revision and shard sizes
   * read 2026-09-23 (58 shards, 1,807,423,488 B); 2,263.69 MB VRAM
   * (WebLLM's prebuilt config, 4k context); tied embeddings. Never the
   * default, and not a candidate for Private mode on its download alone.
   * Kept out of LOCAL_MODELS so /fit's bundle (which reads model.ts for the
   * consent dialog) doesn't carry it: only the worker imports this file.
   */
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    repo: 'mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC',
    revision: '1e80abf71e3d17cd564e2d2b63caa15cb226018e',
    downloadBytes: 1_807_423_488,
    vramMB: 2264,
    hiddenSize: 3072,
    layers: 28,
    activeParams: 3_213_000_000,
    needsShaderF16: true,
    minStorageBufferBindingBytes: 256 * MiB,
    minBufferBytes: 256 * MiB,
  },
} as const satisfies Record<string, LocalModel>;

export type SpikeModelId = keyof typeof SPIKE_MODELS;
