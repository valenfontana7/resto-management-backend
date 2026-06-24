import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler/dist/throttler-storage.interface';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { Inject } from '@nestjs/common';

type MemoryBucket = {
  hits: number;
  expiresAt: number;
  blockedUntil?: number;
};

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memoryFallback = new Map<string, MemoryBucket>();
  private redisUnavailableLogged = false;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis | null,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        return await this.incrementRedis(
          key,
          ttl,
          limit,
          blockDuration,
          throttlerName,
        );
      } catch (error) {
        if (!this.redisUnavailableLogged) {
          this.redisUnavailableLogged = true;
          this.logger.warn(
            `Redis throttler failed, using in-memory fallback: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      throw new Error('RedisThrottlerStorage used without REDIS_CLIENT');
    }

    const hitsKey = `throttler:${throttlerName}:${key}:hits`;
    const blockKey = `throttler:${throttlerName}:${key}:block`;

    const blocked = await this.redis.get(blockKey);
    if (blocked) {
      const blockTtlMs = await this.redis.pttl(blockKey);
      const hits = Number((await this.redis.get(hitsKey)) ?? limit + 1);
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(ttl / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(0, Math.ceil(blockTtlMs / 1000)),
      };
    }

    const totalHits = await this.redis.incr(hitsKey);
    if (totalHits === 1) {
      await this.redis.pexpire(hitsKey, ttl);
    }

    const timeToExpireMs = await this.redis.pttl(hitsKey);

    if (totalHits > limit) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(timeToExpireMs / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    return {
      totalHits,
      timeToExpire: Math.max(0, Math.ceil(timeToExpireMs / 1000)),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const bucketKey = `${throttlerName}:${key}`;
    const now = Date.now();
    const existing = this.memoryFallback.get(bucketKey);

    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return {
        totalHits: existing.hits,
        timeToExpire: Math.max(0, Math.ceil((existing.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.max(
          0,
          Math.ceil((existing.blockedUntil - now) / 1000),
        ),
      };
    }

    const bucket: MemoryBucket =
      !existing || existing.expiresAt <= now
        ? { hits: 0, expiresAt: now + ttl }
        : existing;

    bucket.hits += 1;
    if (bucket.hits === 1) {
      bucket.expiresAt = now + ttl;
    }
    delete bucket.blockedUntil;

    if (bucket.hits > limit) {
      bucket.blockedUntil = now + blockDuration;
      this.memoryFallback.set(bucketKey, bucket);
      return {
        totalHits: bucket.hits,
        timeToExpire: Math.max(0, Math.ceil((bucket.expiresAt - now) / 1000)),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }

    this.memoryFallback.set(bucketKey, bucket);
    return {
      totalHits: bucket.hits,
      timeToExpire: Math.max(0, Math.ceil((bucket.expiresAt - now) / 1000)),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis?.quit();
    } catch (error) {
      this.logger.warn(
        `Redis throttler disconnect failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
