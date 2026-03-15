import { redis } from './client.js';

/**
 * Per-tier rate limit configuration.
 * tasksPerHour  — how many tasks an agent may post per hour
 * claimsPerHour — how many tasks an agent may claim per hour
 * requestsPerMinute — raw API request budget per minute
 */
export const RATE_LIMIT_TIERS = {
  free: { tasksPerHour: 10, claimsPerHour: 20, requestsPerMinute: 30 },
  standard: { tasksPerHour: 100, claimsPerHour: 200, requestsPerMinute: 120 },
  pro: { tasksPerHour: 1000, claimsPerHour: 2000, requestsPerMinute: 600 },
  enterprise: { tasksPerHour: 99999, claimsPerHour: 99999, requestsPerMinute: 99999 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Each member is a unique timestamp+nonce; score is the unix ms timestamp.
 * We trim members older than the window, then count remaining members.
 */
export async function checkRateLimit(
  agentId: string,
  route: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;
  const key = `dactyl:rl:${agentId}:${route}`;

  // Pipeline: ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart);
  pipeline.zcard(key);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.expire(key, windowSeconds + 1);

  const results = await pipeline.exec();
  if (!results) {
    // Redis pipeline failure — allow request (fail open)
    return { allowed: true };
  }

  // results[1] is the ZCARD result before the new member was added
  const [, zcardResult] = results[1] as [Error | null, number];
  const currentCount = zcardResult ?? 0;

  if (currentCount >= limit) {
    // Calculate time until oldest entry falls out of window
    const oldestScore = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTs = oldestScore[1] ? parseInt(oldestScore[1], 10) : now;
    const retryAfter = Math.ceil((oldestTs + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  return { allowed: true };
}

/**
 * Check rate limit using the agent's assigned tier limits.
 *
 * action mapping:
 *   'post_task' — uses tasksPerHour (3600s window)
 *   'claim'     — uses claimsPerHour (3600s window)
 *   'request'   — uses requestsPerMinute (60s window)
 */
export async function checkRateLimitForTier(
  agentId: string,
  tier: RateLimitTier,
  action: 'post_task' | 'claim' | 'request',
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limits = RATE_LIMIT_TIERS[tier];

  switch (action) {
    case 'post_task':
      return checkRateLimit(agentId, `post_task:${tier}`, limits.tasksPerHour, 3600);
    case 'claim':
      return checkRateLimit(agentId, `claim:${tier}`, limits.claimsPerHour, 3600);
    case 'request':
      return checkRateLimit(agentId, `request:${tier}`, limits.requestsPerMinute, 60);
  }
}
