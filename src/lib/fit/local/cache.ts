import { weightsUrl, type LocalModel } from './model';

/**
 * "Are this model's weights already in the browser?" without importing
 * WebLLM — the same test as its `hasModelInCache` (0.2.85, Cache API
 * backend): the scope `webllm/model` holds `tensor-cache.json` and every
 * shard it lists, keyed by absolute URL under the pinned revision.
 *
 * Used on the main thread for gate step 3 (a cached model needs no storage)
 * and to word the consent dialog ("already downloaded"). Any failure reads
 * as "not cached", which only makes the gate stricter.
 */
export const WEBLLM_MODEL_CACHE = 'webllm/model';

export async function isModelCached(model: LocalModel, cacheStorage?: CacheStorage): Promise<boolean> {
  const storage = cacheStorage ?? (typeof caches === 'undefined' ? undefined : caches);
  if (!storage) return false;
  try {
    // `has` first: `open` would create an empty cache as a side effect.
    if (!(await storage.has(WEBLLM_MODEL_CACHE))) return false;
    const cache = await storage.open(WEBLLM_MODEL_CACHE);
    const base = weightsUrl(model);
    const index = await cache.match(new URL('tensor-cache.json', base).href);
    if (!index) return false;
    const { records } = (await index.json()) as { records?: { dataPath: string }[] };
    if (!Array.isArray(records) || records.length === 0) return false;
    const hits = await Promise.all(records.map((r) => cache.match(new URL(r.dataPath, base).href)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}
