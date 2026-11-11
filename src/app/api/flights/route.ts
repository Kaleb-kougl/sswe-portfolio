import { createFlightsProxy } from '@/lib/flights';

/**
 * GET /api/flights — live aircraft over the Bay Area, from adsb.lol, for the
 * Glassgrid demo at /glassgrid (whose CSP allows `connect-src 'self'` only).
 * The logic is in src/lib/flights; the contract is in docs/flights-proxy.md.
 *
 * `force-dynamic`: without Cache Components (not enabled in next.config.ts),
 * GET Route Handlers are already dynamic by default since v15
 * (01-app/03-api-reference/03-file-conventions/route.md, version history),
 * but this one must never be prerendered at build time — the build would
 * call adsb.lol and freeze one answer — and its fetch must never land in
 * Next's data cache. `force-dynamic` guarantees both: it makes every fetch
 * in the segment `no-store` (01-app/02-guides/caching-without-cache-
 * components.md, `dynamic`). Caching is the CDN's job, through the
 * `Cache-Control` the handler sets: a non-ISR route's response is sent with
 * its own headers untouched (next/dist/build/templates/app-route.js).
 *
 * The state (last good snapshot, backoff, in-flight fetch) belongs to this
 * module, so it is per server instance.
 *
 * No rate limit (src/lib/guard.ts), deliberately. What a per-IP limit would
 * protect is adsb.lol, and that is already bounded regardless of traffic: at
 * most one upstream call per 10 s per instance, none while backing off. What
 * is left per request is serialising a cached snapshot, cheaper than the
 * Upstash round trip a limit would add to every CDN miss. Revisit if the
 * route ever takes client input.
 *
 * No CORS headers: same-origin only.
 */
export const dynamic = 'force-dynamic';

/**
 * Seconds Vercel lets one invocation run. A cold instance's first call to
 * adsb.lol can spend up to 45 s on the TLS handshake (UPSTREAM_TIMEOUT_MS in
 * src/lib/flights/upstream-fetch.ts is 50 s), so the default could cut it
 * short. Viewers rarely wait that long: the CDN answers from its copy, and a
 * poller that gives up first finds the result in memory on its next poll,
 * because the upstream call is not tied to the request that started it.
 */
export const maxDuration = 60;

const flights = createFlightsProxy();

export function GET(): Promise<Response> {
  return flights.handle();
}
