/**
 * The one area `/api/flights` serves: the San Francisco Bay Area.
 *
 * Fixed here, server-side, on purpose. The route reads nothing from the
 * request, so it cannot be pointed at another area, and it cannot be used as
 * an open relay to adsb.lol.
 *
 * The upstream query is a circle, the answer is a box: adsb.lol is asked for
 * everything within RADIUS_NM of CENTRE, and the result is cut down to BOX.
 *
 * WHY 60 NM
 *   The box is 1.5° by 1.5° around CENTRE. Its corners are its farthest
 *   points, at 57.5 nm (the southern pair, 37.0°N) and 57.3 nm (the northern
 *   pair), by great-circle distance; the edge midpoints are 45.0 nm north and
 *   south, 35.6 nm east and west. 58 would be the smallest whole number that
 *   covers it; 60 leaves 2.5 nm for rounding and for whatever distance model
 *   the upstream uses. It has to be whole: the upstream applies `int()` to
 *   the radius (adsblol/api, `utils/api_v2.py`). The circle's area outside
 *   the box (about 40%) is the cost, and it is filtered out before anything
 *   is returned. __tests__/flights/adsblol.test.ts checks every corner.
 */

export interface Box {
  /** Degrees north, inclusive. */
  south: number;
  north: number;
  /** Degrees east, inclusive (west is negative). */
  west: number;
  east: number;
}

export const BOX: Box = { south: 37.0, north: 38.5, west: -123.0, east: -121.5 };

export const CENTRE = { lat: 37.75, lon: -122.25 } as const;

/** Nautical miles. See the header for why 60. */
export const RADIUS_NM = 60;

export function inBox(lat: number, lon: number, box: Box = BOX): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

/** Mean Earth radius in nautical miles (6371.0088 km / 1.852). */
const EARTH_RADIUS_NM = 3440.065;

/** Great-circle (haversine) distance between two points, in nautical miles. */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}
