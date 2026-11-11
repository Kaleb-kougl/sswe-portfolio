// @vitest-environment node
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ATTRIBUTION, LICENSE_URL } from '@/lib/flights';
import { USER_AGENT } from '@/lib/flights/adsblol';
import { UPSTREAM_TIMEOUT_MS } from '@/lib/flights/upstream-fetch';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  CACHE_FRESH,
  CACHE_STALE,
  FRESH_MS,
  MAX_STALE_MS,
  backoffMs,
  createFlightsProxy,
  errorCode,
  parseRetryAfter,
  type Fetch,
  type FlightsProxyOptions,
} from '@/lib/flights/proxy';

import { GOOD_REPLY, GROUND_TRIMMED, NOW_MS, UAL, UAL_TRIMMED, reply } from './fixtures';

const URL = 'https://api.adsb.lol/v2/point/37.75/-122.25/60';

type Answer = Response | ((init: RequestInit) => Response | Promise<Response>);

/** A fake upstream that answers from a queue (the last answer repeats) and records every call. */
function upstream(...answers: Answer[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn<Fetch>(async (url, init) => {
    calls.push({ url, init });
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    return typeof next === 'function' ? next(init) : next.clone();
  });
  return { fetch, calls };
}

const ok = (json: unknown = GOOD_REPLY) => new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response('{"error":"upstream secret detail: rate limited 10.1.2.3"}', { status: code, headers });

/** A proxy on a hand-driven clock, with silent logs and mid-range jitter. */
function setup(fetch: Fetch, options: FlightsProxyOptions = {}) {
  const clock = { t: NOW_MS + 500 };
  const warn = vi.fn();
  const proxy = createFlightsProxy({ fetch, now: () => clock.t, random: () => 0.5, env: {}, log: { warn }, ...options });
  return { proxy, clock, warn };
}

afterEach(() => vi.restoreAllMocks());

describe('GET /api/flights, success', () => {
  it('returns the box, trimmed, with attribution and a 10 s CDN cache', async () => {
    const { fetch, calls } = upstream(ok());
    const { proxy, clock } = setup(fetch);

    const res = await proxy.handle();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=10, stale-while-revalidate=20');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_FRESH);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(res.headers.get('X-Flights-Stale')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();

    expect(await res.json()).toStrictEqual({
      now: NOW_MS,
      fetchedAt: clock.t,
      stale: false,
      source: 'adsb.lol',
      attribution: 'Aircraft data © adsb.lol contributors, ODbL 1.0',
      license: 'https://opendatacommons.org/licenses/odbl/1.0/',
      // OUTSIDE (out of the box) and NO_POSITION are gone.
      ac: [UAL_TRIMMED, GROUND_TRIMMED],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL);
    expect(calls[0].init).toMatchObject({ cache: 'no-store', redirect: 'error' });
    expect(calls[0].init.headers).toEqual({ Accept: 'application/json', 'User-Agent': USER_AGENT });
  });

  it('drops malformed aircraft and still answers 200', async () => {
    const { fetch } = upstream(ok(reply([null, { hex: 'zzz' }, { ...UAL, lat: 'north' }, UAL])));
    const { proxy } = setup(fetch);
    const res = await proxy.handle();
    expect(res.status).toBe(200);
    expect((await res.json()).ac).toStrictEqual([UAL_TRIMMED]);
  });

  it('answers from memory inside the 10 s window, with only what is left of it for the CDN', async () => {
    const { fetch } = upstream(ok());
    const { proxy, clock } = setup(fetch);

    const first = await (await proxy.handle()).json();
    clock.t += 3_200;
    const res = await proxy.handle();
    expect(await res.json()).toStrictEqual(first);
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=7, stale-while-revalidate=20');
    expect(fetch).toHaveBeenCalledTimes(1);

    clock.t += FRESH_MS - 3_200;
    await proxy.handle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('makes one upstream call for concurrent cold requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { fetch } = upstream(async () => (await gate, ok()));
    const { proxy } = setup(fetch);

    const pending = Array.from({ length: 5 }, () => proxy.handle());
    release();
    const responses = await Promise.all(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

describe('GET /api/flights, failure', () => {
  it('on 429 with Retry-After: serves the snapshot as stale, and skips upstream until the window passes', async () => {
    const { fetch } = upstream(ok(), status(429, { 'Retry-After': '120' }), ok(reply([UAL])));
    const { proxy, clock, warn } = setup(fetch);

    const good = await (await proxy.handle()).json();
    clock.t += FRESH_MS;

    const res = await proxy.handle();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Flights-Stale')).toBe('1');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_STALE);
    const body = await res.json();
    expect(body).toStrictEqual({ ...good, stale: true });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.parse(warn.mock.calls[0][0])).toEqual({ route: '/api/flights', upstream: 429, reason: 'HTTP 429', failures: 1, retryInMs: 120_000 });

    // Retry-After (120 s) is longer than the first backoff (5-10 s), so it wins.
    for (const step of [1_000, 30_000, 60_000, 28_999]) {
      clock.t += step;
      expect((await proxy.handle()).headers.get('X-Flights-Stale')).toBe('1');
    }
    expect(fetch).toHaveBeenCalledTimes(2);

    clock.t += 1;
    const recovered = await proxy.handle();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(recovered.headers.get('X-Flights-Stale')).toBeNull();
    expect(recovered.headers.get('Cache-Control')).toBe(CACHE_FRESH);
    expect(await recovered.json()).toMatchObject({ stale: false, ac: [UAL_TRIMMED] });
  });

  it('on repeated 5xx: backs off exponentially, inside the jitter bounds, and resets after a success', async () => {
    const { fetch } = upstream(status(502), status(500), status(503), status(504), ok());
    const draws = [0, 0.999, 0.25, 0.5];
    const { proxy, clock, warn } = setup(fetch, { random: () => draws.shift() ?? 0 });

    // failure n blocks for [base*2^(n-1)/2, base*2^(n-1)), here at the chosen draws.
    const expected = [5_000, 19_990, 25_000, 60_000];
    for (const [i, delay] of expected.entries()) {
      const res = await proxy.handle();
      expect(res.status, `failure ${i + 1}`).toBe(503);
      expect(fetch).toHaveBeenCalledTimes(i + 1);
      expect(JSON.parse(warn.mock.calls[i][0]).retryInMs).toBe(delay);
      expect(res.headers.get('Retry-After')).toBe(String(Math.ceil(delay / 1000)));

      clock.t += delay - 1;
      await proxy.handle();
      expect(fetch, 'still backing off').toHaveBeenCalledTimes(i + 1);
      clock.t += 1;
    }
    expect((await proxy.handle()).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('keeps backoffMs within [d/2, d) and caps it', () => {
    for (let failures = 1; failures <= 12; failures++) {
      const d = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
      expect(backoffMs(failures, () => 0)).toBe(d / 2);
      expect(backoffMs(failures, () => 0.999999)).toBeLessThanOrEqual(d);
      expect(backoffMs(failures, () => 0.999999)).toBeGreaterThan(d * 0.99);
      for (let i = 0; i < 50; i++) {
        const v = backoffMs(failures);
        expect(v).toBeGreaterThanOrEqual(d / 2);
        expect(v).toBeLessThanOrEqual(d);
      }
    }
    expect(backoffMs(30, () => 1)).toBe(BACKOFF_MAX_MS);
  });

  it('times out a slow upstream, serves stale, and backs off', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const fetch = vi.fn<Fetch>().mockImplementationOnce(async () => ok()).mockImplementation(hang);
    const { proxy, clock, warn } = setup(fetch, { timeoutMs: 20 });

    await proxy.handle();
    clock.t += FRESH_MS;
    const res = await proxy.handle();
    expect(res.headers.get('X-Flights-Stale')).toBe('1');
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ upstream: 'timeout', failures: 1 });
    await proxy.handle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('times out a body that never finishes', async () => {
    // As undici does, the abort errors the body stream.
    const stalled = (init: RequestInit) =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('{"ac":['));
            init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          },
        }),
        { status: 200 },
      );
    const { fetch } = upstream(stalled);
    const { proxy, warn } = setup(fetch, { timeoutMs: 20 });
    expect((await proxy.handle()).status).toBe(503);
    expect(JSON.parse(warn.mock.calls[0][0]).upstream).toBe('timeout');
  });

  it('answers 503 with Retry-After when there is no snapshot, and never leaks the upstream body', async () => {
    const { fetch } = upstream(status(500));
    const { proxy } = setup(fetch);
    const res = await proxy.handle();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('8'); // 7.5 s at random 0.5, rounded up
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toStrictEqual({
      error: 'Live flight data is temporarily unavailable.',
      reason: 'HTTP 500',
      retryAfter: 8,
      source: 'adsb.lol',
      attribution: ATTRIBUTION,
      license: LICENSE_URL,
    });
  });

  it('treats a network error, a non-JSON body and a reply without `ac` as failures, and says which', async () => {
    const dns = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.adsb.lol'), { code: 'ENOTFOUND' }) });
    for (const [answer, label, why] of [
      [() => Promise.reject(dns), 'network', 'network ENOTFOUND'],
      [() => Promise.reject(new TypeError('fetch failed')), 'network', 'network TypeError'],
      [() => new Response('<html>busy</html>', { status: 200 }), 'invalid', 'invalid not-json'],
      [() => ok({ msg: 'error' }), 'invalid', 'invalid no-ac'],
    ] as const) {
      const { proxy, warn } = setup(vi.fn<Fetch>(answer as never));
      const res = await proxy.handle();
      expect(res.status, label).toBe(503);
      expect((await res.json()).reason, why).toBe(why);
      expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ upstream: label, reason: why });
    }
  });

  it('keeps error messages out of the reason: only a code-shaped string survives', () => {
    const tls = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }) });
    expect(errorCode(tls)).toBe('UNABLE_TO_GET_ISSUER_CERT_LOCALLY');
    expect(errorCode(Object.assign(new Error('x'), { code: 'connect 10.1.2.3:443 <b>' }))).toBe('Error');
    expect(errorCode('a string')).toBe('unknown');
    expect(errorCode(Object.assign(new TypeError('x'), { name: 'Type Error <script>' }))).toBe('unknown');
  });

  it('clears the reason after a success', async () => {
    const { fetch } = upstream(status(503), ok(), status(500));
    const { proxy, clock } = setup(fetch);
    expect((await (await proxy.handle()).json()).reason).toBe('HTTP 503');
    clock.t += BACKOFF_MAX_MS;
    expect((await proxy.handle()).status).toBe(200);
    clock.t += MAX_STALE_MS + 1; // the snapshot is too old to serve, so the next failure answers 503
    expect((await (await proxy.handle()).json()).reason).toBe('HTTP 500');
  });

  it('stops serving a snapshot once it is older than MAX_STALE_MS', async () => {
    const { fetch } = upstream(ok(), status(503, { 'Retry-After': '3600' }));
    const { proxy, clock } = setup(fetch);
    await proxy.handle();
    clock.t += FRESH_MS;
    expect((await proxy.handle()).headers.get('X-Flights-Stale')).toBe('1');
    clock.t += MAX_STALE_MS - FRESH_MS;
    expect((await proxy.handle()).status).toBe(200);
    clock.t += 1;
    const res = await proxy.handle();
    expect(res.status).toBe(503);
    expect(Number(res.headers.get('Retry-After'))).toBe(3600 - MAX_STALE_MS / 1000 + FRESH_MS / 1000);
  });

  it('reads Retry-After as seconds or an HTTP-date, and caps it', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30_000);
    expect(parseRetryAfter(' 0 ', now)).toBe(0);
    expect(parseRetryAfter('Tue, 10 Nov 2026 12:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter('Tue, 10 Nov 2026 11:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('999999999', now)).toBe(60 * 60_000);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe('the API key', () => {
  it('is sent, in the configured header, only when both variables are set', async () => {
    const cases = [
      [{}, undefined],
      [{ ADSBLOL_API_KEY: 'k-123' }, undefined],
      [{ ADSBLOL_API_KEY_HEADER: 'api-auth' }, undefined],
      [{ ADSBLOL_API_KEY: 'k-123', ADSBLOL_API_KEY_HEADER: 'api-auth' }, 'k-123'],
    ] as const;
    for (const [env, sent] of cases) {
      const { fetch, calls } = upstream(ok());
      const { proxy } = setup(fetch, { env });
      const res = await proxy.handle();
      const headers = calls[0].init.headers as Record<string, string>;
      expect(headers['api-auth'], JSON.stringify(env)).toBe(sent);
      expect(Object.keys(headers).filter((h) => h !== 'Accept' && h !== 'User-Agent'), JSON.stringify(env)).toEqual(sent ? ['api-auth'] : []);
      const text = (await res.text()) + JSON.stringify([...res.headers]);
      expect(text).not.toContain('k-123');
    }
  });
});

describe('the request', () => {
  it('says who is calling', async () => {
    const { fetch, calls } = upstream(ok());
    await setup(fetch).proxy.handle();
    expect((calls[0].init.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
  });
});

/**
 * The other tests stand in for fetch. This one uses Node's own, against a
 * local server answering with a reply captured from api.adsb.lol on
 * 2026-11-11 (one aircraft, every field adsb.lol sent), so the request options
 * (redirect, cache, signal, headers) and the parsing meet a real HTTP stack.
 */
describe('with Node fetch and a real HTTP server', () => {
  const CAPTURED = {
    hex: 'a6504b', type: 'adsb_icao', flight: 'ASA789  ', r: 'N506AS', t: 'B738', alt_baro: 13800, alt_geom: 14325, gs: 388.9, track: 234.1,
    baro_rate: 2304, squawk: '6350', emergency: 'none', category: 'A3', lat: 37.447411, lon: -122.867929, nic: 8, rc: 186, seen_pos: 0.446,
    version: 2, nic_baro: 1, nac_p: 10, nac_v: 1, sil: 3, sil_type: 'perhour', gva: 2, sda: 2, alert: 0, spi: 0, mlat: [], tisb: [],
  };

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      raw: server,
      url: `http://127.0.0.1:${port}/v2/point/37.75/-122.25/60`,
      close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
    };
  }

  it('fetches, parses and keeps registration and type', async () => {
    let userAgent: string | undefined;
    const server = await serve((req, res) => {
      userAgent = req.headers['user-agent'];
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': 'globe-reapi-sticky3="d3755c645a9e4fad"; Max-Age=600; HttpOnly' });
      res.end(JSON.stringify(reply([CAPTURED], Date.now())));
    });
    try {
      const proxy = createFlightsProxy({ url: server.url, env: {}, log: { warn: () => {} } });
      const res = await proxy.handle();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ac).toHaveLength(1);
      expect(body.ac[0]).toMatchObject({ hex: 'a6504b', flight: 'ASA789', r: 'N506AS', t: 'B738', alt_baro: 13800, gs: 388.9, category: 'A3' });
      expect(body.ac[0]).not.toHaveProperty('emergency');
      expect(userAgent).toBe(USER_AGENT);
    } finally {
      await server.close();
    }
  });

  it('keeps the connection open between polls, past the 4 s the global fetch allows', { timeout: 15_000 }, async () => {
    // adsb.lol's TLS handshake took ~9 s (upstream-fetch.ts): reusing the
    // connection is what makes polls after the first fast.
    let connections = 0;
    const server = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply([CAPTURED], Date.now())));
    });
    // 0: never time the socket out, and send no `Keep-Alive: timeout=` hint,
    // like adsb.lol. With a hint, the global fetch would keep the connection
    // too, and this test would prove nothing (checked: without one, the global
    // fetch opens a second connection here; upstreamFetch does not).
    server.raw.keepAliveTimeout = 0;
    server.raw.on('connection', () => (connections += 1));
    try {
      const clock = { t: Date.now() };
      const proxy = createFlightsProxy({ url: server.url, env: {}, log: { warn: () => {} }, now: () => clock.t });
      expect((await proxy.handle()).status).toBe(200);
      await new Promise((r) => setTimeout(r, 4_500));
      clock.t += FRESH_MS; // past the 10 s window, so the proxy calls upstream again
      expect((await proxy.handle()).status).toBe(200);
      expect(connections).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('reports a redirect and a refused connection with a reason', async () => {
    const server = await serve((_req, res) => {
      res.writeHead(301, { Location: 'https://example.com/' });
      res.end();
    });
    try {
      const res = await createFlightsProxy({ url: server.url, env: {}, log: { warn: () => {} } }).handle();
      expect(res.status).toBe(503);
      expect((await res.json()).reason).toMatch(/^network /);
    } finally {
      await server.close();
    }
    const refused = await createFlightsProxy({ url: server.url, env: {}, log: { warn: () => {} } }).handle();
    expect((await refused.json()).reason).toBe('network ECONNREFUSED');
  });
});

describe('the route', () => {
  it('is dynamic, takes no request, and always asks upstream for the same place', async () => {
    const { fetch, calls } = upstream(ok());
    // The route's proxy uses the default fetch, upstreamFetch (undici on a keep-alive pool).
    vi.resetModules();
    vi.doMock('@/lib/flights/upstream-fetch', async (load) => ({ ...(await load<object>()), upstreamFetch: fetch }));
    try {
      const route = await import('@/app/api/flights/route');
      expect(route.dynamic).toBe('force-dynamic');
      // No parameter: a query string (`?lat=0&lon=0&radius=250`) has nowhere to go.
      expect(route.GET.length).toBe(0);
      const res = await route.GET();
      expect(res.status).toBe(200);
      expect(calls.map((c) => c.url)).toEqual([URL]);
      expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic', 'maxDuration']);
      // Above the slowest upstream call, so a cold TLS handshake is not cut short.
      expect(route.maxDuration * 1000).toBeGreaterThan(UPSTREAM_TIMEOUT_MS);
    } finally {
      vi.doUnmock('@/lib/flights/upstream-fetch');
      vi.resetModules();
    }
  });
});
