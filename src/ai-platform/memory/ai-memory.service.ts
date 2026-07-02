import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { AiTaskResult } from '../types/ai-task.types';

const CACHE_PREFIX = 'ai-memory:';

@Injectable()
export class AiMemoryService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  buildKey(taskKey: string, input: unknown, modelVersion?: string): string {
    const canonical = JSON.stringify({ taskKey, input, modelVersion });
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `${CACHE_PREFIX}${hash}`;
  }

  async get<T>(key: string): Promise<AiTaskResult<T> | null> {
    const value = await this.cache.get<AiTaskResult<T>>(key);
    return value ?? null;
  }

  async set<T>(
    key: string,
    value: AiTaskResult<T>,
    ttlSeconds: number,
  ): Promise<void> {
    await this.cache.set(key, value, ttlSeconds * 1000);
  }
}
