/// <reference types="@webgpu/types" />
/**
 * PRIVATE-MODE WORKER — the only module that imports WebLLM.
 *
 * Created by `client.ts` with
 *   new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
 * which Turbopack (and webpack) bundle as a separate worker chunk, so WebLLM's
 * ~6 MB never reaches a page bundle. Everything heavy happens here: the GPU
 * probe, the benchmark, the weight download and cache writes, tokenization,
 * segmentation, inference (one grammar-forced decision per candidate segment,
 * plan v4), incremental JSON parsing, merging, judging, and the watchdog. The main
 * thread receives finished `Requirement` rows, one `postMessage` each.
 *
 * Gate step 1 does NOT use this file: it runs in `probe-worker.ts`, a tiny
 * separate entry, so probing never downloads WebLLM. `probe` is still
 * answered here (same code) for callers that already hold this worker.
 *
 * Protocol: ./protocol.ts. Run logic (testable without WebGPU): ./run.ts.
 */
import {
  MLCEngine,
  hasModelInCache,
  prebuiltAppConfig,
  type AppConfig,
  type ChatCompletionChunk,
} from '@mlc-ai/web-llm';

import {
  buildDecisionMessages,
  defaultDecision,
  judge,
  judgeRequirement,
  mergeDecisions,
  mergeOne,
  prepareExtraction,
  reportCoverage,
  segmentJd,
  validateJd,
} from '@/lib/fit';

import { runBench } from './bench';
import { probeGpu } from './gate';
import { LOCAL_MODEL, LOCAL_MODELS, weightsUrl, type LocalModel, type LocalModelId } from './model';
import { SPIKE_MODELS, type SpikeModelId } from './spike-models';
import { toLoadProgress, type FromWorker, type RunStrategy, type ToWorker } from './protocol';
import type { ChatMessage } from '@/lib/fit/contract';
import { classifyError, errorMessage, runExtraction, type RunDeps, type RunEngine, type RunHandle } from './run';
import { runQuestions } from './run-v2';
import type { QuestionMode } from '@/lib/fit/abstain';

const scope = self as unknown as {
  navigator: { gpu?: GPU };
  postMessage(msg: FromWorker): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorker>) => void): void;
};

const post = (msg: FromWorker) => scope.postMessage(msg);
const now = () => performance.now();

/** The pinned model record: WebLLM's prebuilt entry, weights at a fixed revision. */
function appConfig(model: LocalModel): AppConfig {
  const record = prebuiltAppConfig.model_list.find((r) => r.model_id === model.id);
  if (!record) throw new Error(`${model.id} is not in WebLLM's prebuilt model list`);
  return {
    model_list: [{ ...record, model: weightsUrl(model) }],
    // The Cache API: WebLLM's best-tested backend, and what the consent
    // dialog promises ("cached in this browser for next time").
    cacheBackend: 'cache',
  };
}

let engine: MLCEngine | null = null;
let loaded = false;
/** The model `engine` holds (or is loading). Only ids from LOCAL_MODELS. */
let model: LocalModel = LOCAL_MODEL;
/** The one request in flight (bench, load or run), and how to stop it. */
let current: { id: number; cancel: () => void } | null = null;

function busy(id: number): boolean {
  if (!current) return false;
  post({ type: 'error', id, code: 'busy', message: `Request ${current.id} is still running.` });
  return true;
}

async function handleBench(id: number) {
  const gpu = scope.navigator.gpu;
  if (!gpu) return post({ type: 'error', id, code: 'no_webgpu', message: 'WebGPU is not available in this worker.' });
  current = { id, cancel: () => {} };
  try {
    post({ type: 'bench_result', id, result: await runBench(gpu, LOCAL_MODEL, now) });
  } catch (err) {
    post({ type: 'error', id, code: classifyError(err), message: errorMessage(err) });
  } finally {
    current = null;
  }
}

async function handleLoad(id: number, modelId?: LocalModelId | SpikeModelId) {
  const pinned: Record<string, LocalModel> = { ...LOCAL_MODELS, ...SPIKE_MODELS };
  const wanted: LocalModel | undefined = modelId ? pinned[modelId] : LOCAL_MODEL;
  if (!wanted) return post({ type: 'error', id, code: 'load_failed', message: `Unknown model ${String(modelId)}.` });
  if (loaded && engine && model.id === wanted.id) return post({ type: 'loaded', id, fromCache: true, elapsedMs: 0 });
  if (engine) {
    // Switching models: free the old one's GPU memory first.
    await engine.unload().catch(() => {});
    engine = null;
    loaded = false;
  }
  model = wanted;
  const started = now();
  let cancelled = false;
  const config = appConfig(model);
  engine = new MLCEngine({
    appConfig: config,
    initProgressCallback: (report) => {
      if (!cancelled) post({ type: 'progress', id, progress: toLoadProgress(report, model.downloadBytes) });
    },
  });
  const loading = engine;
  current = {
    id,
    cancel: () => {
      cancelled = true;
      // unload() aborts an in-progress reload (its AbortController) and
      // frees whatever reached the GPU. Shards already cached stay cached.
      void loading.unload().catch(() => {});
      post({ type: 'cancelled', id });
    },
  };
  try {
    const fromCache = await hasModelInCache(model.id, config).catch(() => false);
    await loading.reload(model.id);
    if (cancelled) return;
    loaded = true;
    post({ type: 'loaded', id, fromCache, elapsedMs: now() - started });
  } catch (err) {
    if (cancelled) return;
    engine = null;
    loaded = false;
    const code = classifyError(err);
    post({ type: 'error', id, code: code === 'internal' ? 'load_failed' : code, message: errorMessage(err) });
  } finally {
    if (current?.id === id) current = null;
    if (cancelled) {
      engine = null;
      loaded = false;
    }
  }
}

/** Adapts `MLCEngine`'s OpenAI-style stream to the run logic's `RunEngine`. */
function asRunEngine(mlc: MLCEngine): RunEngine {
  return {
    async *stream(messages, { grammar, maxTokens }) {
      const chunks: AsyncIterable<ChatCompletionChunk> = await mlc.chat.completions.create({
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0,
        max_tokens: maxTokens,
        // Compact-JSON grammar, not `json_object` + schema: see grammar.ts.
        response_format: { type: 'grammar', grammar },
        ...(model.extraBody ? { extra_body: model.extraBody } : {}),
      });
      for await (const chunk of chunks) {
        yield {
          delta: chunk.choices[0]?.delta?.content ?? '',
          usage: chunk.usage ?? undefined,
        };
      }
    },
    /**
     * v2's one-token question. Logprobs are WebLLM's softmax over the
     * grammar-masked logits AT THE REQUEST'S TEMPERATURE (0.2.85,
     * `sampleTokenFromLogits`): temperature 0 is clamped to 1e-6 and gives a
     * one-hot distribution, so it must be 1 here. `top_p` near 0 keeps the
     * sampled token the argmax; it doesn't touch the reported logprobs.
     * Penalties are pinned off (Qwen's config defaults repetition to 1.1).
     */
    async ask(messages, { grammar }) {
      const reply = await mlc.chat.completions.create({
        messages,
        stream: false,
        temperature: 1,
        top_p: 1e-5,
        max_tokens: 1,
        logprobs: true,
        top_logprobs: 5,
        frequency_penalty: 0,
        presence_penalty: 0,
        repetition_penalty: 1,
        response_format: { type: 'grammar', grammar },
        ...(model.extraBody ? { extra_body: model.extraBody } : {}),
      });
      return {
        top: reply.choices[0]?.logprobs?.content?.[0]?.top_logprobs ?? [],
        usage: reply.usage ?? undefined,
      };
    },
    interrupt() {
      void mlc.interruptGenerate();
    },
  };
}

async function handleRun(id: number, jd: string, strategy: RunStrategy = 'v1', questions?: QuestionMode) {
  if (!engine || !loaded) {
    return post({ type: 'error', id, code: 'not_loaded', message: 'Load the model first.' });
  }
  let handle: RunHandle | null = null;
  const deps: RunDeps = {
    engine: asRunEngine(engine),
    post,
    now,
    validateJd,
    segmentJd,
    buildMessages: buildDecisionMessages,
    defaultDecision,
    mergeOne,
    mergeDecisions,
    prepareExtraction,
    judgeRequirement: (req) => judgeRequirement(req),
    judge: (extraction) => judge(extraction),
    reportCoverage,
  };
  handle = strategy === 'v2' ? runQuestions(id, jd, deps, { questions }) : runExtraction(id, jd, deps);
  current = { id, cancel: () => handle?.cancel() };
  try {
    await handle.done;
  } finally {
    if (current?.id === id) current = null;
  }
}

/**
 * Chat spike (evals/chat): one greedy free-text completion of messages built
 * by src/lib/chat. No grammar, temperature 0, penalties off so decoding is
 * the same for every model family. Timed from here: first non-empty delta
 * (prefill included) and total.
 */
async function handleGenerate(id: number, messages: ChatMessage[], maxTokens: number) {
  if (!engine || !loaded) {
    return post({ type: 'error', id, code: 'not_loaded', message: 'Load the model first.' });
  }
  const mlc = engine;
  let cancelled = false;
  current = {
    id,
    cancel: () => {
      cancelled = true;
      void mlc.interruptGenerate();
      post({ type: 'cancelled', id });
    },
  };
  const started = now();
  let firstTokenMs: number | null = null;
  let text = '';
  let finishReason: string | null = null;
  let usage: ChatCompletionChunk['usage'] | undefined;
  try {
    const chunks: AsyncIterable<ChatCompletionChunk> = await mlc.chat.completions.create({
      messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0,
      max_tokens: maxTokens,
      frequency_penalty: 0,
      presence_penalty: 0,
      repetition_penalty: 1,
      ...(model.extraBody ? { extra_body: model.extraBody } : {}),
    });
    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta && firstTokenMs === null) firstTokenMs = now() - started;
      text += delta;
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (cancelled) return;
    const extra = (usage as { extra?: { prefill_tokens_per_s?: number; decode_tokens_per_s?: number } } | undefined)?.extra;
    post({
      type: 'generated',
      id,
      text,
      stats: {
        firstTokenMs,
        totalMs: now() - started,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        prefillTokensPerSecond: extra?.prefill_tokens_per_s ?? null,
        decodeTokensPerSecond: extra?.decode_tokens_per_s ?? null,
        finishReason,
      },
    });
  } catch (err) {
    if (!cancelled) post({ type: 'error', id, code: classifyError(err), message: errorMessage(err) });
  } finally {
    if (current?.id === id) current = null;
  }
}

scope.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'probe':
      void probeGpu(scope.navigator.gpu, LOCAL_MODEL).then(
        (result) => post({ type: 'probe_result', id: msg.id, result }),
        () => post({ type: 'probe_result', id: msg.id, result: { supported: false, reason: 'no-adapter' } }),
      );
      return;
    case 'bench':
      if (!busy(msg.id)) void handleBench(msg.id);
      return;
    case 'load':
      if (!busy(msg.id)) void handleLoad(msg.id, msg.modelId);
      return;
    case 'run':
      if (!busy(msg.id)) void handleRun(msg.id, msg.jd, msg.strategy, msg.questions);
      return;
    case 'generate':
      if (!busy(msg.id)) void handleGenerate(msg.id, msg.messages, msg.maxTokens);
      return;
    case 'cancel':
      current?.cancel();
      return;
  }
});
