import type { RedisOptions } from 'ioredis';

/** Parsea REDIS_URL (redis:// o rediss://) para ioredis / BullMQ. */
export function parseRedisUrl(
  redisUrl: string,
  options?: { bullmq?: boolean },
): RedisOptions {
  const url = new URL(redisUrl);
  const useTls = url.protocol === 'rediss:';

  return {
    host: url.hostname,
    port: parseInt(url.port || (useTls ? '25061' : '6379'), 10),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(useTls ? { tls: {} } : {}),
    maxRetriesPerRequest: options?.bullmq ? null : 3,
  };
}
