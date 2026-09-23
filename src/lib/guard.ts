import { createHash } from 'node:crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * GUARD — what stands between the public internet and the server routes.
 *
 * Today it holds one thing: the per-IP rate limit for `/api/mcp`. Phase 2
 * adds the `/api/fit` pieces here (5/h and 15/day per IP, the daily spend
 * cap, input limits, the bot check) as further entries in POLICIES and
 * further checks beside `rateLimit`.
 *
 * FAILURE MODE: `rateLimit` fails OPEN — unconfigured or unreachable
 * Upstash lets the request through, with a warning. That is right for MCP
 * only: its tools read a static corpus and spend no tokens, so the worst case
 * is CPU. The Phase 2 spend cap must fail CLOSED: if Redis can't be read, the
 * fit route cannot know what it has spent, and it must refuse (503) rather
 * than call the model. Give fit its own fail-closed path; don't reuse this one.
 */

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms at which the window resets. */
  reset: number;
}

/** Anything that can answer "may this key go ahead?". Upstash in production; a fake in tests. */
export interface Limiter {
  limit(key: string): Promise<LimitResult>;
}

interface Policy {
  requests: number;
  /** In Upstash's duration syntax. */
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
}

export const POLICIES = {
  mcp: { requests: 60, window: '1 m' },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[guard] ${message}`);
}

/**
 * The client's IP. On Vercel, `x-forwarded-for` is set by the platform (a
 * client-supplied value is overwritten), so its first entry is the client.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * SHA-256 of the IP with a server-side salt, so neither Redis keys nor logs
 * hold a raw address. Unsalted, the hash of an IPv4 address can be reversed
 * by brute force in seconds — so it still works without the salt, but says so.
 */
export function hashIp(ip: string, salt: string | undefined = process.env.IP_HASH_SALT): string {
  if (!salt) warnOnce('salt', 'IP_HASH_SALT is not set; hashing IPs unsalted.');
  return createHash('sha256').update(`${salt ?? ''}:${ip}`).digest('hex');
}

function upstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

const limiters = new Map<PolicyName, Limiter | null>();

/** The Upstash limiter for a policy, or `null` when Upstash isn't configured. Built once per instance. */
function defaultLimiter(name: PolicyName): Limiter | null {
  if (!limiters.has(name)) {
    const redis = upstashRedis();
    const policy = POLICIES[name];
    limiters.set(
      name,
      redis &&
        new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(policy.requests, policy.window),
          prefix: `rl:${name}`,
          // An unreachable Redis resolves as allowed after this long.
          timeout: 1000,
        }),
    );
  }
  return limiters.get(name) ?? null;
}

function tooManyRequests(result: LimitResult, now: number): Response {
  const retryAfter = Math.max(1, Math.ceil((result.reset - now) / 1000));
  return Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: `Rate limit exceeded. Retry in ${retryAfter}s.` },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  );
}

export interface RateLimitOptions {
  /** Inject a limiter (tests). `null` means "not configured". Omit to use Upstash from env. */
  limiter?: Limiter | null;
  now?: () => number;
}

/**
 * Apply a policy to a request. Returns a 429 Response when the caller is
 * over the limit, or `null` to let the request through. Fails open (see top).
 */
export async function rateLimit(
  name: PolicyName,
  req: Request,
  { limiter = defaultLimiter(name), now = Date.now }: RateLimitOptions = {},
): Promise<Response | null> {
  if (!limiter) {
    warnOnce(
      `unconfigured:${name}`,
      `Upstash is not configured (UPSTASH_REDIS_REST_URL / _TOKEN); ${name} requests are not rate limited.`,
    );
    return null;
  }

  let result: LimitResult;
  try {
    result = await limiter.limit(hashIp(clientIp(req)));
  } catch (error) {
    warnOnce(`error:${name}`, `Rate limiter failed; allowing ${name} requests. ${String(error)}`);
    return null;
  }

  return result.success ? null : tooManyRequests(result, now());
}
