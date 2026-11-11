/**
 * Everything specific to adsb.lol: the request URL, the optional key
 * header, and the shape of its answer. The rest of src/lib/flights does not
 * know which provider it talks to.
 *
 * UNVERIFIED AGAINST https://api.adsb.lol/docs
 *   api.adsb.lol is not reachable from the environment this was written in,
 *   so nothing here has been checked against a live response. What it rests
 *   on instead:
 *   - adsblol/api's README: "a drop-in replacement" for the ADSBExchange v2
 *     API; rate limits "dynamic based on the environment load"; an API key
 *     "in the future", obtained by feeding;
 *   - adsblol/api's source on `main` (src/adsb_api/utils/api_v2.py and
 *     models.py): `GET /v2/point/{lat}/{lon}/{radius}`, radius in nautical
 *     miles, whole, at most 250; the reply is `V2Response_Model`,
 *     `{ ac, ctime, msg, now, ptime, total }`, produced by readsb with `jv2`;
 *   - readsb's README-json.md: the aircraft fields and their units, and that
 *     with `jv2` the top-level `now` is in milliseconds.
 *   The first live request should confirm the path, the units of `now`, and
 *   how a rate limit is signalled (429 and `Retry-After` are assumed).
 *
 * The data is ODbL 1.0. Any page that shows it must carry ATTRIBUTION with a
 * link to LICENSE_URL; see docs/flights-proxy.md.
 */
import { z } from 'zod';

import { CENTRE, RADIUS_NM } from './area';

export const SOURCE = 'adsb.lol';
export const ATTRIBUTION = 'Aircraft data © adsb.lol contributors, ODbL 1.0';
export const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1.0/';

export const ADSBLOL_BASE_URL = 'https://api.adsb.lol';

/**
 * Sent on every upstream request. adsb.lol is a free, volunteer-run API:
 * saying who is calling (and where to find them) is the courteous default,
 * and keeps the request from looking like an anonymous script.
 */
export const USER_AGENT = 'kalebkougl-portfolio-flights/1 (+https://kalebkougl-portfolio.vercel.app/glassgrid/)';

/** The one upstream URL this site ever requests. Unverified: see the header. */
export function upstreamUrl(): string {
  return `${ADSBLOL_BASE_URL}/v2/point/${CENTRE.lat}/${CENTRE.lon}/${RADIUS_NM}`;
}

export interface KeyEnv {
  ADSBLOL_API_KEY?: string;
  ADSBLOL_API_KEY_HEADER?: string;
}

export type KeyConfig = { header: string; value: string } | null;

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const HEADER_VALUE = /^[^\r\n]+$/;

/**
 * The API key header, or null to send none.
 *
 * adsb.lol has said a key will be required but not how it is sent, so the
 * header NAME is configuration too (ADSBLOL_API_KEY_HEADER), to be set when
 * adsb.lol publishes it. Both variables, or neither: one without the other
 * sends nothing, with a warning. The key goes upstream only; it is never
 * logged and never put in a response.
 */
export function keyConfig(env: KeyEnv, log: Pick<Console, 'warn'> = console): KeyConfig {
  const value = env.ADSBLOL_API_KEY?.trim();
  const header = env.ADSBLOL_API_KEY_HEADER?.trim();
  if (!value && !header) return null;
  if (!value || !header) {
    log.warn('[flights] ADSBLOL_API_KEY and ADSBLOL_API_KEY_HEADER must be set together; sending no key.');
    return null;
  }
  if (!HEADER_NAME.test(header) || !HEADER_VALUE.test(value)) {
    log.warn('[flights] ADSBLOL_API_KEY_HEADER is not a header name, or the key contains a line break; sending no key.');
    return null;
  }
  return { header, value };
}

/**
 * One aircraft as /api/flights returns it: these fields only, each omitted
 * when the upstream did not send it (readsb's own convention). Units are
 * readsb's: feet, knots, degrees, feet per minute, seconds.
 */
export interface Aircraft {
  /** 24-bit ICAO address, 6 lower-case hex digits; a leading `~` marks a non-ICAO address. */
  hex: string;
  /** Callsign, trimmed. */
  flight?: string;
  lat: number;
  lon: number;
  /** Barometric altitude, ft, or `"ground"`. */
  alt_baro?: number | 'ground';
  /** Geometric (GNSS) altitude, ft. */
  alt_geom?: number;
  /** Ground speed, kt. */
  gs?: number;
  /** True track over ground, degrees. */
  track?: number;
  /** ft/min. */
  baro_rate?: number;
  /** ft/min. */
  geom_rate?: number;
  /** Emitter category, A0 to D7. */
  category?: string;
  /** Mode A code, 4 octal digits. */
  squawk?: string;
  /** Seconds since any message from this aircraft. */
  seen?: number;
  /** Seconds since its position was updated. */
  seen_pos?: number;
  /** Registration from adsb.lol's aircraft database (readsb `r`), e.g. `N506AS`. */
  r?: string;
  /** ICAO aircraft type designator from the database (readsb `t`), e.g. `B738`. */
  t?: string;
  /**
   * Source of the position (`adsb_icao`, `mlat`, `tisb_other`, ...). Not the
   * aircraft type, despite the name: that is `t`.
   */
  type?: string;
}

/**
 * A field that is wrong is dropped, not fatal: an odd `alt_geom` should not
 * hide an aircraft. Only `hex`, `lat` and `lon` are required, because
 * without them there is nothing to place or key on.
 */
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

const aircraftSchema = z.object({
  hex: z
    .string()
    .regex(/^~?[0-9a-fA-F]{6}$/)
    .transform((s) => s.toLowerCase()),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  flight: optional(
    z
      .string()
      .max(16)
      .transform((s) => s.trim())
      .pipe(z.string().regex(/^[\x21-\x7e ]{1,8}$/)),
  ),
  alt_baro: optional(z.union([z.number().min(-2000).max(100_000), z.literal('ground')])),
  alt_geom: optional(z.number().min(-2000).max(100_000)),
  gs: optional(z.number().min(0).max(5000)),
  track: optional(z.number().min(0).max(360)),
  baro_rate: optional(z.number().min(-100_000).max(100_000)),
  geom_rate: optional(z.number().min(-100_000).max(100_000)),
  category: optional(z.string().regex(/^[A-D][0-7]$/)),
  squawk: optional(z.string().regex(/^[0-7]{4}$/)),
  seen: optional(z.number().min(0)),
  seen_pos: optional(z.number().min(0)),
  r: optional(z.string().regex(/^[A-Za-z0-9-]{1,12}$/)),
  t: optional(z.string().regex(/^[A-Za-z0-9]{1,4}$/)),
  type: optional(z.string().regex(/^[a-z_]{1,24}$/)),
});

/** Bounds the work one reply can cause; a 60 nm circle holds a few hundred. */
export const MAX_UPSTREAM_AIRCRAFT = 10_000;

const replySchema = z.object({
  ac: z.array(z.unknown()),
  now: optional(z.number().positive()),
});

export interface ParsedReply {
  /** Epoch ms of the upstream's data. */
  now: number;
  ac: Aircraft[];
}

/**
 * Validates an upstream reply. Returns null when the reply itself is not
 * usable (no `ac` array); otherwise every aircraft that fails is dropped, the
 * rest are trimmed to the Aircraft fields. Everything else in the reply,
 * and on each aircraft, is discarded.
 *
 * `now`: readsb sends seconds, and milliseconds under `jv2` (which adsb.lol
 * uses). A value below 1e11 is taken as seconds; missing, it is `fetchedAt`.
 */
export function parseReply(json: unknown, fetchedAt: number): ParsedReply | null {
  const reply = replySchema.safeParse(json);
  if (!reply.success) return null;
  const ac: Aircraft[] = [];
  for (const item of reply.data.ac.slice(0, MAX_UPSTREAM_AIRCRAFT)) {
    const parsed = aircraftSchema.safeParse(item);
    if (parsed.success) ac.push(withoutUndefined(parsed.data));
  }
  const now = reply.data.now;
  return { now: now === undefined ? fetchedAt : now < 1e11 ? Math.round(now * 1000) : now, ac };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
