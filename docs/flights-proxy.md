# Flights proxy

`GET /api/flights` returns the aircraft currently over the San Francisco Bay Area, from the [adsb.lol](https://adsb.lol) live API. It exists for the Glassgrid demo at `/glassgrid/` (see [glassgrid-hosting.md](glassgrid-hosting.md)): the demo's CSP is `connect-src 'self'`, so it cannot call adsb.lol itself and needs a same-origin endpoint.

| File | What it holds |
|---|---|
| `src/app/api/flights/route.ts` | The route: `force-dynamic`, one module-level proxy instance, `GET` only. |
| `src/lib/flights/proxy.ts` | Caching, coalescing, timeout, backoff, the responses. |
| `src/lib/flights/adsblol.ts` | The upstream URL, the optional key header, validation of the reply. Everything adsb.lol-specific. |
| `src/lib/flights/area.ts` | The box, the circle that covers it, and why 60 nm. |
| `__tests__/flights/` | Unit tests against hand-written fixtures, with an injected fetch and clock. |

## The contract

The route reads nothing from the request. There are no parameters, and a query string is ignored: the area is fixed server-side, so the endpoint cannot be pointed anywhere else or used as a relay to adsb.lol.

**Area.** Latitude 37.0 to 38.5, longitude −123.0 to −121.5, edges included. Upstream is asked for a 60 nm circle around 37.75, −122.25; the box's farthest corners are 57.5 nm out. Aircraft outside the box, or without a position, are dropped.

**200:**

```json
{
  "now": 1793000000000,
  "fetchedAt": 1793000000500,
  "stale": false,
  "source": "adsb.lol",
  "attribution": "Aircraft data © adsb.lol contributors, ODbL 1.0",
  "license": "https://opendatacommons.org/licenses/odbl/1.0/",
  "ac": [
    {
      "hex": "a1b2c3", "flight": "UAL123", "lat": 37.6512, "lon": -122.2011,
      "alt_baro": 4200, "alt_geom": 4350, "gs": 182.4, "track": 281.3,
      "baro_rate": -768, "geom_rate": -736, "category": "A3", "squawk": "4521",
      "seen": 0.1, "seen_pos": 0.4, "type": "adsb_icao"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `now` | Epoch **ms** of the upstream's data. adsb.lol sends ms (readsb's `jv2` format); a value that is clearly seconds is converted. |
| `fetchedAt` | Epoch ms at which this server instance fetched it. |
| `stale` | `true` when the upstream is failing and this is the last good snapshot (see below). |
| `ac[]` | One object per aircraft, with these fields only, in [readsb's units](https://github.com/wiedehopf/readsb/blob/dev/README-json.md): `hex` (lower case; a leading `~` is a non-ICAO address), `flight` (callsign, trimmed), `lat`, `lon`, `alt_baro` (ft, or `"ground"`), `alt_geom` (ft), `gs` (kt), `track` (°), `baro_rate` and `geom_rate` (ft/min), `category` (A0–D7), `squawk`, `seen` and `seen_pos` (s), `r` (registration, e.g. `N506AS`), `t` (ICAO type designator, e.g. `B738`), `type` (the position's source, e.g. `adsb_icao`, `mlat`; not the aircraft type, which is `t`). |

`hex`, `lat` and `lon` are always present. Every other field is **omitted** when the upstream did not send it, or sent something malformed (readsb's own convention: a key is left out when there is no data). Everything else adsb.lol sends (`dst`, `rssi`, `nav_*`, `emergency`, ...) is dropped. An aircraft whose `hex`, `lat` or `lon` is missing or malformed is dropped; the response still succeeds. At most 2,000 aircraft.

**503**, when there is no data to show:

```json
{ "error": "Live flight data is temporarily unavailable.", "reason": "network ENOTFOUND", "retryAfter": 8, "source": "adsb.lol", "attribution": "…", "license": "…" }
```

with `Retry-After: <seconds>` and `Cache-Control: no-store`. `reason` says why the last upstream call failed, as a short code and never upstream text:

| `reason` | Meaning |
| --- | --- |
| `HTTP 403`, `HTTP 429`, `HTTP 503`, ... | adsb.lol answered with that status. |
| `timeout` | No complete answer within 50 s (up to 45 s of it connecting). |
| `network <code>` | The request never got an answer. `<code>` is Node's error code: `ENOTFOUND` (DNS), `ECONNREFUSED`, `ECONNRESET`, `UND_ERR_CONNECT_TIMEOUT`, a TLS code such as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` (a proxy or security tool intercepting HTTPS: set `NODE_EXTRA_CA_CERTS` to its root certificate, or run Node with `--use-system-ca`), or `TypeError` for a redirect, which is refused on purpose. |
| `invalid not-json`, `invalid no-ac`, `invalid too-large` | An answer came, but not a usable one. |

It is absent when nothing has failed yet.

Any other method is a 405 (Next.js). There are no CORS headers: same-origin only.

## Caching

| Response | `Cache-Control` | Other |
|---|---|---|
| fresh, just fetched | `public, s-maxage=10, stale-while-revalidate=20` | |
| fresh, from memory, *n* s old | `public, s-maxage=<10 − n>, stale-while-revalidate=20` | |
| stale snapshot | `public, s-maxage=5` | `X-Flights-Stale: 1` |
| 503 | `no-store` | `Retry-After` |

Vercel's CDN honours `s-maxage`, so every viewer in a region collapses onto one function call per 10 s. The instance then holds the last snapshot for 10 s and answers from memory, and concurrent cold requests share one in-flight upstream call. That matters because the CDN's cache key includes the query string: `/api/flights?1`, `?2`, ... each miss the CDN, but they still cannot cause more than **one upstream call per 10 s per instance**. A copy served from memory gets only what is left of the 10 s window, so the CDN never holds it past that.

The route is `export const dynamic = 'force-dynamic'`: it is never prerendered at build time (which would call adsb.lol during `next build` and freeze one answer), and its fetch never enters Next's data cache. Next sends a dynamic route handler's own `Cache-Control` unchanged. The upstream fetch also passes `cache: 'no-store'`.

There is no per-IP rate limit on this route (`src/lib/guard.ts` is not used): upstream traffic is already bounded per instance regardless of how many requests arrive, and a memory hit is cheaper than the Upstash round trip a limit would add.

## The connection to adsb.lol

The proxy does not use the global `fetch`. It uses undici's, on its own pool (`src/lib/flights/upstream-fetch.ts`), with an idle connection kept for **5 minutes** and up to **45 s** allowed to connect (TCP and TLS), 50 s for the whole call. The route sets `maxDuration = 60` so Vercel does not cut a slow first call short.

The reason is measured, not guessed. On 2026-11-11, from a Mac, `curl` timed each phase against `/v2/point/37.75/-122.25/60`:

| Phase | adsb.lol | api.github.com |
| --- | --- | --- |
| DNS | 0.03 s | 0.02 s |
| TCP connect | 0.20 s | 0.06 s |
| TLS handshake | **9.2 s** | 0.04 s |
| First byte after TLS | 0.6 s | 0.03 s |

Node's own handshake (`node:tls`, the same day, both of `api.adsb.lol`'s IPv4 addresses, which resolve via `ingress-system3.adsb.lol`) was slower still:

| Address | TLS 1.3 | TLS 1.2 |
| --- | --- | --- |
| 159.195.81.163 | 25.2 s | 28.3 s |
| 159.195.60.218 | 14.2 s | 23.7 s |

TCP connected in 0.17–0.22 s every time, so the cost is the handshake itself, on both servers and both TLS versions: nothing on this side picks a slow path. IPv6 did not connect at all from that network. A request on an open connection is quick. Node's global fetch closes an idle connection after 4 s, unless the server sends a `Keep-Alive: timeout=` hint (adsb.lol does not), and allows 10 s to connect. Polling every 10 s or more, every call paid the handshake again, and most hit `UND_ERR_CONNECT_TIMEOUT`. With the pool, the first call per server instance pays the handshake (up to 45 s are allowed) and later ones reuse the connection for up to 5 minutes of idleness. A test (`keeps the connection open between polls…` in `__tests__/flights/proxy.test.ts`) checks this against a local server that, like adsb.lol, sends no hint; with the global fetch the same test opens a second connection.

Next.js's fetch patch is bypassed as a result. Nothing depends on it: the route is `force-dynamic`, the request is `cache: 'no-store'`, and the CDN does the caching.

Viewers rarely wait for any of this. The CDN answers from its copy for 10 s, then for 20 s more while one request refreshes it in the background, so only a cold start (no copy at all) waits for adsb.lol. Even then the upstream call is not tied to the request that started it: if that viewer's poller gives up first (Glassgrid waits 20 s), the call carries on, its result lands in the instance's memory, and the next poll is answered from there.

## When adsb.lol fails

A failure is a 429, any other non-2xx, a timeout (50 s, covering connecting, TLS and the body as well as the headers), a network error, or a body that is not JSON or has no `ac` array.

1. **Back off.** After the *n*-th failure in a row, the instance does not call adsb.lol for a random time in [d/2, d), where d = 10 s × 2^(n−1), capped at 5 minutes: 5–10 s, 10–20 s, 20–40 s, ... If the upstream sent `Retry-After` (seconds or an HTTP date, capped at one hour), the wait is at least that. The first success resets it.
2. **Serve the last good snapshot**, with `stale: true`, `X-Flights-Stale: 1` and a 5 s cache, for as long as it is at most **10 minutes** old. Past that it is discarded: aircraft move about 4 nm a minute, and an old picture is worse than none.
3. **With no snapshot, 503** with `Retry-After` set to when the backoff ends.

The upstream's body, status text and headers never reach the client. Each failure logs one line, with the status or kind and the same `reason`:

```json
{"route":"/api/flights","upstream":429,"reason":"HTTP 429","failures":1,"retryInMs":120000}
```

Every request sends `User-Agent: kalebkougl-portfolio-flights/1 (+https://kalebkougl-portfolio.vercel.app/glassgrid/)`: adsb.lol is a free, volunteer-run API, and saying who is calling is the courteous default.

**Checked against the live API** on 2026-11-11 (from a Mac, with curl): `GET /v2/point/37.75/-122.25/60` answers 200 `application/json` with `Cache-Control: no-store`, an `ac` array in the readsb fields above, and a sticky-session `Set-Cookie` the proxy ignores. A captured aircraft from that reply is the fixture of the real-fetch tests in `__tests__/flights/proxy.test.ts`.

State (snapshot, backoff, in-flight fetch) is in memory, per server instance. A cold start begins with neither.

## API key (not needed yet)

adsb.lol says a key will be required "in the future", obtained by [feeding](https://adsb.lol/feed). It has not said how a key is sent, so the header name is configuration too:

| Variable | |
|---|---|
| `ADSBLOL_API_KEY` | The key. |
| `ADSBLOL_API_KEY_HEADER` | The request header to send it in. **To be confirmed** when adsb.lol publishes key documentation. |

Both or neither: with only one set, no key is sent, and each server instance warns once when the route first loads. The key is sent to adsb.lol only; it is never logged or returned. Set them in Vercel → Settings → Environment Variables and redeploy. If adsb.lol starts answering 401 or 403, the log lines above will show it, and the route will serve stale and then 503 while it backs off.

## Attribution (required)

adsb.lol's data is licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/). **Any page that displays this data must show the attribution** and link the licence, for example:

> Aircraft data © adsb.lol contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1.0/)

Every response carries `attribution` and `license` so the client can render it from the data rather than hard-code it. A rendered map or list is a Produced Work and needs that notice. Publishing the data itself, or a database derived from it (an export, an archive of snapshots), also brings in the ODbL's share-alike terms.

## What is unverified

`api.adsb.lol` was not reachable where this was written. Since then the path, status, content type and aircraft fields have been checked by hand from a Mac (above); the rest still rests on:

- adsblol/api's README: a "drop-in replacement" for the ADSBExchange v2 API; rate limits "dynamic based on the environment load"; a key "in the future".
- adsblol/api's source on `main` (`src/adsb_api/utils/api_v2.py`, `models.py`): `GET /v2/point/{lat}/{lon}/{radius}`, radius in whole nautical miles up to 250, reply `{ ac, ctime, msg, now, ptime, total }`, produced by readsb with `jv2`.
- readsb's `README-json.md`: field names, units, and `now` in milliseconds under `jv2`.

To confirm on the first deployment, against [api.adsb.lol/docs](https://api.adsb.lol/docs):

- that the proxy itself (Node's fetch inside Next) gets the same 200 that curl does: the first local run answered 503 before `reason` existed, so its cause is unknown;
- that `now` is in ms;
- how rate limiting is signalled: 429 and `Retry-After` are assumed; anything else non-2xx is also backed off;
- that the URL answers directly: a redirect is treated as a failure (`redirect: 'error'`), so the proxy only ever talks to the one URL it builds;
- that Vercel's CDN caches the 200s (a second request inside 10 s should show `x-vercel-cache: HIT`).

The test fixtures (`__tests__/flights/fixtures.ts`) are hand-written to that shape, not captured. Replace them with a captured reply once one is available.
