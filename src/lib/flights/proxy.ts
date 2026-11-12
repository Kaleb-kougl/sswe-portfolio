/**
 * FLIGHTS PROXY — live aircraft over the Bay Area, same-origin, for the
 * Glassgrid demo (its CSP is `connect-src 'self'`, so it cannot call
 * adsb.lol itself). src/app/api/flights/route.ts is a thin wrapper over
 * `createFlightsProxy()`; the state lives in the instance it creates.
 *
 * ONE UPSTREAM CALL PER 10 S PER INSTANCE, WHATEVER THE TRAFFIC
 *   - Vercel's CDN does most of it: `s-maxage=10, stale-while-revalidate=20`
 *     collapses every viewer of a region onto one function call per 10 s.
 *   - The instance does the rest, because the CDN cannot: its cache key
 *     includes the query string, so `?1`, `?2`, ... each miss it. A snapshot
 *     younger than FRESH_MS is answered from memory, and concurrent cold
 *     requests share one in-flight fetch.
 *
 * FAILURE (429, any other non-2xx, timeout, network error, unusable body)
 *   The instance backs off: exponential, with jitter, and never shorter than
 *   the upstream's `Retry-After`. Until it passes, upstream is not called at
 *   all. Meanwhile the last good snapshot is served with `stale: true`, a
 *   5 s cache and `X-Flights-Stale: 1`; with none (or one older than
 *   MAX_STALE_MS), a 503 with `Retry-After`. The upstream's body and error
 *   text never reach the client; the log line carries its status only.
 *
 * State is per instance and in memory: a cold start begins with no snapshot
 * and no backoff. That is acceptable for a demo; nothing here is shared
 * between instances, and nothing needs to be.
 */
import { ATTRIBUTION, LICENSE_URL, SOURCE, USER_AGENT, keyConfig, parseReply, upstreamUrl, type Aircraft, type KeyEnv } from './adsblol';
import { inBox } from './area';
import { UPSTREAM_TIMEOUT_MS, upstreamFetch } from './upstream-fetch';

/** Upstream data is reused, from memory and at the CDN, for this long. */
export const FRESH_MS = 10_000;
/** A snapshot older than this is not served, even as stale. */
export const MAX_STALE_MS = 10 * 60_000;
export const TIMEOUT_MS = UPSTREAM_TIMEOUT_MS;
export const BACKOFF_BASE_MS = 10_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** A longer (or nonsensical) Retry-After is capped at this. */
export const RETRY_AFTER_MAX_MS = 60 * 60_000;
/** The upstream body is refused past this many characters. */
export const MAX_BODY_CHARS = 5_000_000;
/** At most this many aircraft per response. */
export const MAX_AIRCRAFT = 2_000;

export const CACHE_FRESH = `public, s-maxage=${FRESH_MS / 1000}, stale-while-revalidate=20`;
export const CACHE_STALE = 'public, s-maxage=5';

export interface FlightsBody {
  /** Epoch ms of the upstream's data. */
  now: number;
  /** Epoch ms at which this instance fetched it. */
  fetchedAt: number;
  stale: boolean;
  source: typeof SOURCE;
  attribution: typeof ATTRIBUTION;
  license: typeof LICENSE_URL;
  ac: Aircraft[];
}

interface Snapshot {
  now: number;
  fetchedAt: number;
  ac: Aircraft[];
}

/**
 * Why an upstream call failed. `detail` is a short code, never the
 * upstream's body or an error message: `network` carries the error's code
 * (`ENOTFOUND`, `ECONNRESET`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, ...),
 * `invalid` says which check failed.
 */
type Failure =
  | { kind: 'status'; status: number; retryAfterMs?: number }
  | { kind: 'timeout' }
  | { kind: 'network'; detail: string }
  | { kind: 'invalid'; detail: 'too-large' | 'not-json' | 'no-ac' };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface FlightsProxyOptions {
  /** Defaults to `upstreamFetch`: undici on a keep-alive pool (upstream-fetch.ts). */
  fetch?: Fetch;
  /** Epoch ms. */
  now?: () => number;
  /** In [0, 1): the backoff jitter. */
  random?: () => number;
  env?: KeyEnv;
  timeoutMs?: number;
  log?: Pick<Console, 'warn'>;
  /** The upstream URL; default `upstreamUrl()`. Tests point it at a local server. */
  url?: string;
}

export interface FlightsProxy {
  /** Answers GET /api/flights. Takes no request: nothing a client sends changes what is fetched. */
  handle(): Promise<Response>;
}

/**
 * The backoff after the `failures`-th failure in a row: BACKOFF_BASE_MS
 * doubled each time, capped at BACKOFF_MAX_MS, with "equal jitter" — a
 * uniform draw from the upper half, [d/2, d). Half keeps the growth; the
 * jitter keeps instances that failed together from retrying together.
 */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}

/** `Retry-After` as ms from `now`: delta-seconds or an HTTP-date. Undefined if absent or unreadable. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(RETRY_AFTER_MAX_MS, Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.min(RETRY_AFTER_MAX_MS, Math.max(0, date - now));
}

function label(failure: Failure): string | number {
  return failure.kind === 'status' ? failure.status : failure.kind;
}

/** A failure as one short phrase for the 503 body and the log: `HTTP 403`, `timeout`, `network ENOTFOUND`, `invalid no-ac`. */
function reason(failure: Failure): string {
  switch (failure.kind) {
    case 'status':
      return `HTTP ${failure.status}`;
    case 'timeout':
      return 'timeout';
    default:
      return `${failure.kind} ${failure.detail}`;
  }
}

/**
 * The code of a fetch error. Node's fetch throws `TypeError('fetch failed')`
 * with the real error as `cause` (`ENOTFOUND`, `ECONNREFUSED`,
 * `UND_ERR_CONNECT_TIMEOUT`, a TLS code, ...). Only a code-shaped string is
 * kept, so nothing else from the error reaches a log or a response.
 */
export function errorCode(error: unknown): string {
  const code = (e: unknown): string | undefined => {
    if (!e || typeof e !== 'object') return undefined;
    const value = (e as { code?: unknown }).code;
    return typeof value === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : undefined;
  };
  const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined;
  const name = error instanceof Error && /^[A-Za-z]{1,64}$/.test(error.name) ? error.name : 'unknown';
  return code(cause) ?? code(error) ?? name;
}

export function createFlightsProxy({
  fetch: fetchImpl = upstreamFetch,
  now = Date.now,
  random = Math.random,
  env = { ADSBLOL_API_KEY: process.env.ADSBLOL_API_KEY, ADSBLOL_API_KEY_HEADER: process.env.ADSBLOL_API_KEY_HEADER },
  timeoutMs = TIMEOUT_MS,
  log = console,
  url = upstreamUrl(),
}: FlightsProxyOptions = {}): FlightsProxy {
  const key = keyConfig(env, log);

  let snapshot: Snapshot | null = null;
  let failures = 0;
  let blockedUntil = 0;
  let inflight: Promise<Snapshot | null> | null = null;
  /** The last failure, for the 503's `reason`; cleared by a success. */
  let lastFailure: Failure | null = null;

  /** The last good snapshot, if it is still young enough to show at all. */
  function lastGood(t: number): Snapshot | null {
    if (snapshot && t - snapshot.fetchedAt > MAX_STALE_MS) snapshot = null;
    return snapshot;
  }

  async function request(): Promise<Snapshot | Failure> {
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
    if (key) headers[key.header] = key.value;
    const controller = new AbortController();
    // A timer rather than AbortSignal.timeout(): it covers reading the body
    // too, and tests can stand in for it.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // `no-store`: never Next's data cache (the CDN caches our answer instead).
      // `redirect: 'error'`: the one URL this site requests, not wherever it points.
      const res = await fetchImpl(url, { headers, signal: controller.signal, cache: 'no-store', redirect: 'error' });
      const fetchedAt = now();
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        return { kind: 'status', status: res.status, retryAfterMs: parseRetryAfter(res.headers.get('retry-after'), fetchedAt) };
      }
      const text = await res.text();
      if (text.length > MAX_BODY_CHARS) return { kind: 'invalid', detail: 'too-large' };
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { kind: 'invalid', detail: 'not-json' };
      }
      const reply = parseReply(json, fetchedAt);
      if (!reply) return { kind: 'invalid', detail: 'no-ac' };
      return { now: reply.now, fetchedAt, ac: reply.ac.filter((a) => inBox(a.lat, a.lon)).slice(0, MAX_AIRCRAFT) };
    } catch (error) {
      return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network', detail: errorCode(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** One upstream call; records the outcome. Never throws. */
  async function refresh(): Promise<Snapshot | null> {
    const result = await request();
    if (!('kind' in result)) {
      snapshot = result;
      failures = 0;
      blockedUntil = 0;
      lastFailure = null;
      return result;
    }
    failures += 1;
    const t = now();
    const delay = Math.max(backoffMs(failures, random), result.kind === 'status' ? (result.retryAfterMs ?? 0) : 0);
    blockedUntil = t + delay;
    lastFailure = result;
    log.warn(JSON.stringify({ route: '/api/flights', upstream: label(result), reason: reason(result), failures, retryInMs: delay }));
    return null;
  }

  function body(s: Snapshot, stale: boolean): FlightsBody {
    return { now: s.now, fetchedAt: s.fetchedAt, stale, source: SOURCE, attribution: ATTRIBUTION, license: LICENSE_URL, ac: s.ac };
  }

  function fresh(s: Snapshot, t: number): Response {
    // From memory, the CDN gets only what is left of the window, so its copy
    // never outlives FRESH_MS by more than the stale-while-revalidate period.
    const left = Math.max(1, Math.ceil((FRESH_MS - (t - s.fetchedAt)) / 1000));
    const cacheControl = left >= FRESH_MS / 1000 ? CACHE_FRESH : `public, s-maxage=${left}, stale-while-revalidate=20`;
    return Response.json(body(s, false), { headers: { 'Cache-Control': cacheControl } });
  }

  function fallback(t: number): Response {
    const s = lastGood(t);
    if (s) {
      return Response.json(body(s, true), { headers: { 'Cache-Control': CACHE_STALE, 'X-Flights-Stale': '1' } });
    }
    const retryAfter = Math.max(1, Math.ceil((blockedUntil - t) / 1000));
    return Response.json(
      {
        error: 'Live flight data is temporarily unavailable.',
        // A short code (see Failure), never upstream text: safe to show, and it
        // is what tells a 403 from a DNS or certificate problem when debugging.
        ...(lastFailure ? { reason: reason(lastFailure) } : {}),
        retryAfter,
        source: SOURCE,
        attribution: ATTRIBUTION,
        license: LICENSE_URL,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
    );
  }

  return {
    async handle() {
      const t = now();
      const s = lastGood(t);
      if (s && t - s.fetchedAt < FRESH_MS) return fresh(s, t);
      if (t < blockedUntil) return fallback(t);
      inflight ??= refresh().finally(() => {
        inflight = null;
      });
      const result = await inflight;
      return result ? fresh(result, now()) : fallback(now());
    },
  };
}
