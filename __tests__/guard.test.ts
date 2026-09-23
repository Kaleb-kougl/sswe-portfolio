import { afterEach, describe, expect, it, vi } from 'vitest';

import { POLICIES, clientIp, hashIp, rateLimit, type Limiter } from '@/lib/guard';

/** The MCP policy, enforced in memory: a fixed window per key, no network. */
function memoryLimiter(now: () => number): Limiter {
  const { requests } = POLICIES.mcp;
  const windowMs = 60_000;
  const hits = new Map<string, { start: number; count: number }>();
  return {
    async limit(key) {
      const t = now();
      let w = hits.get(key);
      if (!w || t - w.start >= windowMs) hits.set(key, (w = { start: t, count: 0 }));
      w.count++;
      return { success: w.count <= requests, limit: requests, remaining: Math.max(0, requests - w.count), reset: w.start + windowMs };
    },
  };
}

const req = (ip = '203.0.113.7') => new Request('http://localhost/api/mcp', { method: 'POST', headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });

afterEach(() => vi.restoreAllMocks());

describe('guard', () => {
  it('limits MCP to 60 requests a minute', () => {
    expect(POLICIES.mcp).toMatchObject({ requests: 60, window: '1 m' });
  });

  it('answers the 61st request in a minute with 429 and Retry-After', async () => {
    let t = 1_000_000;
    const now = () => t;
    const limiter = memoryLimiter(now);

    for (let i = 1; i <= 60; i++) {
      t += 500; // 60 requests over 30 s
      expect(await rateLimit('mcp', req(), { limiter, now }), `request ${i}`).toBeNull();
    }
    t += 500;
    const res = await rateLimit('mcp', req(), { limiter, now });
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get('Retry-After'))).toBe(30);
    expect((await res!.json()).error.message).toMatch(/Rate limit/);

    // Another IP is unaffected; the same IP is let back in when the window turns.
    expect(await rateLimit('mcp', req('198.51.100.1'), { limiter, now })).toBeNull();
    t += 30_000;
    expect(await rateLimit('mcp', req(), { limiter, now })).toBeNull();
  });

  it('keys the limiter by a salted hash, never the raw IP', async () => {
    const keys: string[] = [];
    const limiter: Limiter = { limit: async (k) => (keys.push(k), { success: true, limit: 60, remaining: 59, reset: 0 }) };
    await rateLimit('mcp', req(), { limiter });
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0]).not.toContain('203.0.113.7');
    expect(hashIp('203.0.113.7', 'a')).not.toBe(hashIp('203.0.113.7', 'b'));
  });

  it('warns and hashes unsalted when no salt is set', async () => {
    // Fresh module: the warning is once per instance, and earlier tests may have used it.
    vi.resetModules();
    const fresh = await import('@/lib/guard');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(fresh.hashIp('203.0.113.7', '')).toMatch(/^[0-9a-f]{64}$/);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/IP_HASH_SALT/);
  });

  it('fails open, with a warning, when Upstash is not configured', async () => {
    vi.resetModules();
    const fresh = await import('@/lib/guard');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await fresh.rateLimit('mcp', req(), { limiter: null })).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toMatch(/not rate limited/);
  });

  it('fails open when the limiter throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter: Limiter = { limit: async () => Promise.reject(new Error('ECONNREFUSED')) };
    expect(await rateLimit('mcp', req(), { limiter })).toBeNull();
  });

  it('reads the client IP from the first x-forwarded-for entry', () => {
    expect(clientIp(req('192.0.2.5'))).toBe('192.0.2.5');
    expect(clientIp(new Request('http://localhost/', { headers: { 'x-real-ip': '192.0.2.9' } }))).toBe('192.0.2.9');
    expect(clientIp(new Request('http://localhost/'))).toBe('unknown');
  });
});
