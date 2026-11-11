// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { keyConfig, parseReply, upstreamUrl } from '@/lib/flights/adsblol';
import { BOX, CENTRE, RADIUS_NM, distanceNm, inBox } from '@/lib/flights/area';

import { GOOD_REPLY, GROUND_TRIMMED, NOW_MS, OUTSIDE, UAL, UAL_TRIMMED, reply } from './fixtures';

describe('the area', () => {
  it('asks for a circle that covers every point of the box', () => {
    const corners = [
      [BOX.south, BOX.west],
      [BOX.south, BOX.east],
      [BOX.north, BOX.west],
      [BOX.north, BOX.east],
    ] as const;
    for (const [lat, lon] of corners) {
      const d = distanceNm(CENTRE.lat, CENTRE.lon, lat, lon);
      expect(d, `${lat},${lon}`).toBeGreaterThan(57);
      expect(d, `${lat},${lon}`).toBeLessThan(RADIUS_NM - 2);
    }
    expect(Number.isInteger(RADIUS_NM)).toBe(true);
    expect(CENTRE).toEqual({ lat: (BOX.south + BOX.north) / 2, lon: (BOX.west + BOX.east) / 2 });
  });

  it('keeps the box edges and drops anything past them', () => {
    expect(inBox(37.0, -123.0)).toBe(true);
    expect(inBox(38.5, -121.5)).toBe(true);
    expect(inBox(36.9999, -122)).toBe(false);
    expect(inBox(38, -121.4999)).toBe(false);
    expect(inBox(OUTSIDE.lat, OUTSIDE.lon)).toBe(false);
    expect(distanceNm(CENTRE.lat, CENTRE.lon, OUTSIDE.lat, OUTSIDE.lon)).toBeLessThan(RADIUS_NM);
  });

  it('builds one fixed upstream URL', () => {
    expect(upstreamUrl()).toBe('https://api.adsb.lol/v2/point/37.75/-122.25/60');
  });
});

describe('parseReply', () => {
  it('trims each aircraft to the contract fields and drops the reply envelope', () => {
    const parsed = parseReply(GOOD_REPLY, 0);
    expect(parsed?.now).toBe(NOW_MS);
    // Filtering to the box is the proxy's job; here only NO_POSITION goes.
    expect(parsed?.ac).toHaveLength(3);
    expect(parsed?.ac[0]).toStrictEqual(UAL_TRIMMED);
    expect(parsed?.ac[1]).toStrictEqual(GROUND_TRIMMED);
  });

  it('drops aircraft without a usable hex or position, and keeps the rest', () => {
    const bad = [
      null,
      42,
      'a1b2c3',
      [],
      { ...UAL, hex: undefined },
      { ...UAL, hex: 'xyz123' },
      { ...UAL, hex: 'a1b2c3d' },
      { ...UAL, lat: '37.6' },
      { ...UAL, lat: 91 },
      { ...UAL, lon: Number.NaN },
      { ...UAL, lon: undefined },
    ];
    const parsed = parseReply(reply([...bad, UAL]), 0);
    expect(parsed?.ac).toStrictEqual([UAL_TRIMMED]);
  });

  it('drops a malformed optional field but keeps its aircraft', () => {
    const odd = { ...UAL, flight: 42, alt_baro: 'flying', gs: -1, squawk: '9999', category: 'Z9', track: '281', type: '<script>', r: 'N1 <b>', t: 'B7378' };
    const [kept] = parseReply(reply([odd]), 0)!.ac;
    expect(kept).toStrictEqual({ hex: 'a1b2c3', alt_geom: 4350, baro_rate: -768, geom_rate: -736, lat: 37.6512, lon: -122.2011, seen_pos: 0.4, seen: 0.1 });
    expect(parseReply(reply([{ ...UAL, flight: '        ' }]), 0)!.ac[0]).not.toHaveProperty('flight');
    expect(parseReply(reply([{ hex: '~2a0b1c', lat: 37.5, lon: -122 }]), 0)!.ac[0]).toStrictEqual({ hex: '~2a0b1c', lat: 37.5, lon: -122 });
  });

  it('refuses a reply with no aircraft array', () => {
    for (const json of [null, [], 'ok', {}, { ac: null }, { ac: {} }, { msg: 'error', now: NOW_MS }]) {
      expect(parseReply(json, 0), JSON.stringify(json)).toBeNull();
    }
    expect(parseReply({ ac: [] }, 0)).toEqual({ now: 0, ac: [] });
  });

  it('reads `now` as ms, takes seconds when it is clearly seconds, and falls back to the fetch time', () => {
    expect(parseReply(reply([], NOW_MS), 1)?.now).toBe(NOW_MS);
    expect(parseReply(reply([], NOW_MS / 1000), 1)?.now).toBe(NOW_MS);
    expect(parseReply({ ac: [], now: 'soon' }, 7)?.now).toBe(7);
  });
});

describe('keyConfig', () => {
  const quiet = { warn: vi.fn() };

  it('sends a key only when both the key and its header name are set', () => {
    expect(keyConfig({}, quiet)).toBeNull();
    expect(keyConfig({ ADSBLOL_API_KEY: 'k' }, quiet)).toBeNull();
    expect(keyConfig({ ADSBLOL_API_KEY_HEADER: 'api-auth' }, quiet)).toBeNull();
    expect(keyConfig({ ADSBLOL_API_KEY: ' k ', ADSBLOL_API_KEY_HEADER: 'api-auth' }, quiet)).toEqual({ header: 'api-auth', value: 'k' });
  });

  it('warns about a half-set or malformed pair, without printing the key', () => {
    const warn = vi.fn();
    expect(keyConfig({ ADSBLOL_API_KEY: 'secret-key' }, { warn })).toBeNull();
    expect(keyConfig({ ADSBLOL_API_KEY: 'secret-key', ADSBLOL_API_KEY_HEADER: 'bad header' }, { warn })).toBeNull();
    expect(keyConfig({ ADSBLOL_API_KEY: 'secret\r\nkey', ADSBLOL_API_KEY_HEADER: 'api-auth' }, { warn })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret');
  });
});
