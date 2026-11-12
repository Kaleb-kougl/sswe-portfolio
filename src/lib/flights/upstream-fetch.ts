import { Agent, fetch as undiciFetch } from 'undici';

import type { Fetch } from './proxy';

/**
 * The fetch the proxy uses for adsb.lol: undici's, on its own connection
 * pool, so the connection can outlive the gap between polls.
 *
 * Why not the global fetch: measured from a Mac on 2026-11-11, adsb.lol's
 * TLS handshake is slow. curl's took 9.2 s (TCP connect 0.2 s; GitHub's whole
 * request 0.13 s). Node's own (node:tls, both of api.adsb.lol's addresses)
 * took 14 to 28 s, with TLS 1.3 and TLS 1.2 alike. A request on an open
 * connection comes back in well under a second. Node's global fetch closes an
 * idle connection after 4 s and allows 10 s to connect, TLS included, so
 * every poll paid the handshake again and failed with
 * `UND_ERR_CONNECT_TIMEOUT`. Here connecting may take 45 s, once, and the
 * connection is then kept for 5 minutes between polls.
 *
 * Next's fetch patch is bypassed too. Nothing is lost: the route is
 * `force-dynamic` and the proxy passes `cache: 'no-store'` anyway, and the
 * CDN, not Next's data cache, is what caches the answer.
 */

/** The longest connecting (TCP and TLS) may take: above the 28 s measured, with room. */
export const CONNECT_TIMEOUT_MS = 45_000;

/**
 * The longest a whole upstream call may take: connecting plus the answer.
 * `TIMEOUT_MS` in proxy.ts is this value; the route's `maxDuration` is above it.
 */
export const UPSTREAM_TIMEOUT_MS = 50_000;

/**
 * How long an idle connection to adsb.lol is kept open. Long, because opening
 * one costs up to half a minute: a lull of a few minutes between viewers
 * should not mean paying it again. If adsb.lol closes it sooner, the next
 * call fails once (`network …`, backed off) and reconnects.
 */
export const KEEP_ALIVE_MS = 5 * 60_000;

let agent: Agent | undefined;

/** One pool per server instance, made on first use. */
export function upstreamAgent(): Agent {
  agent ??= new Agent({
    connect: { timeout: CONNECT_TIMEOUT_MS },
    keepAliveTimeout: KEEP_ALIVE_MS,
    // Caps a server's own Keep-Alive hint; without a hint KEEP_ALIVE_MS applies.
    keepAliveMaxTimeout: KEEP_ALIVE_MS,
    // One poll at a time per instance (requests are coalesced), so one
    // connection, plus one spare for a request that overlaps a slow close.
    connections: 2,
  });
  return agent;
}

export const upstreamFetch: Fetch = (url, init) =>
  // undici's own RequestInit and Response are structurally the global ones;
  // the casts only bridge the two packages' type declarations.
  undiciFetch(url, { ...(init as object), dispatcher: upstreamAgent() } as never) as unknown as Promise<Response>;
