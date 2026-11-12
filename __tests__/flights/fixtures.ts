/**
 * Upstream replies for the flights proxy tests.
 *
 * Hand-written, not captured: api.adsb.lol was not reachable where these
 * were made. The shape follows adsblol/api's `V2Response_Model` and readsb's
 * README-json.md (`jv2`: `now` in ms), including the fields the proxy must
 * drop (`r`, `t`, `dst`, `dir`, `rssi`, `messages`, `mlat`, `tisb`, ...).
 */

export const NOW_MS = 1_793_000_000_000;

/** In the box: SFO approach. Every kept field present, plus extras. */
export const UAL = {
  hex: 'A1B2C3',
  type: 'adsb_icao',
  flight: 'UAL123  ',
  r: 'N12345',
  t: 'B38M',
  alt_baro: 4200,
  alt_geom: 4350,
  gs: 182.4,
  ias: 170,
  track: 281.3,
  baro_rate: -768,
  geom_rate: -736,
  squawk: '4521',
  emergency: 'none',
  category: 'A3',
  nav_qnh: 1013.6,
  lat: 37.6512,
  lon: -122.2011,
  nic: 8,
  rc: 186,
  seen_pos: 0.4,
  version: 2,
  mlat: [],
  tisb: [],
  messages: 48211,
  seen: 0.1,
  rssi: -18.2,
  dst: 6.3,
  dir: 148.2,
};

/** In the box: on the ground at OAK, sparse. */
export const GROUND = {
  hex: 'ab12ef',
  type: 'adsb_icao',
  flight: 'SWA901  ',
  alt_baro: 'ground',
  gs: 12,
  track: 90,
  lat: 37.7213,
  lon: -122.2208,
  seen: 2.3,
  seen_pos: 2.3,
  mlat: [],
  tisb: [],
  messages: 900,
  rssi: -22.1,
};

/** Inside the 60 nm circle, outside the box (south-east of Gilroy). */
export const OUTSIDE = {
  hex: 'c0ffee',
  type: 'mlat',
  flight: 'N456AB  ',
  alt_baro: 3500,
  lat: 36.98,
  lon: -121.45,
  seen: 1,
  mlat: ['lat', 'lon'],
  tisb: [],
  messages: 10,
  rssi: -30,
};

/** No position (Mode S only): nothing to place. */
export const NO_POSITION = { hex: 'abcdef', type: 'mode_s', alt_baro: 31000, seen: 4, mlat: [], tisb: [], messages: 3, rssi: -28 };

export function reply(ac: unknown[], now = NOW_MS) {
  return { ac, ctime: now - 400, msg: 'No error', now, ptime: 3, total: ac.length };
}

export const GOOD_REPLY = reply([UAL, GROUND, OUTSIDE, NO_POSITION]);

/** What UAL and GROUND become. */
export const UAL_TRIMMED = {
  hex: 'a1b2c3',
  type: 'adsb_icao',
  flight: 'UAL123',
  r: 'N12345',
  t: 'B38M',
  alt_baro: 4200,
  alt_geom: 4350,
  gs: 182.4,
  track: 281.3,
  baro_rate: -768,
  geom_rate: -736,
  squawk: '4521',
  category: 'A3',
  lat: 37.6512,
  lon: -122.2011,
  seen_pos: 0.4,
  seen: 0.1,
};

export const GROUND_TRIMMED = {
  hex: 'ab12ef',
  type: 'adsb_icao',
  flight: 'SWA901',
  alt_baro: 'ground',
  gs: 12,
  track: 90,
  lat: 37.7213,
  lon: -122.2208,
  seen: 2.3,
  seen_pos: 2.3,
};
