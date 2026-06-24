import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class UploadQuotaService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertUploadAllowed(
    userId: string,
    fileSizeBytes: number,
  ): Promise<void> {
    const limits = this.getLimits();
    const dayKey = new Date().toISOString().slice(0, 10);
    const countKey = `upload-quota:count:${userId}:${dayKey}`;
    const bytesKey = `upload-quota:bytes:${userId}:${dayKey}`;

    const count = (await this.cache.get<number>(countKey)) ?? 0;
    const bytes = (await this.cache.get<number>(bytesKey)) ?? 0;

    if (count >= limits.maxFilesPerDay) {
      throw new HttpException(
        `Alcanzaste el límite diario de subidas (${limits.maxFilesPerDay} archivos/día).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (bytes + fileSizeBytes > limits.maxBytesPerDay) {
      throw new HttpException(
        'Alcanzaste el límite diario de almacenamiento para subidas.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ttlMs = 24 * 60 * 60 * 1000;
    await this.cache.set(countKey, count + 1, ttlMs);
    await this.cache.set(bytesKey, bytes + fileSizeBytes, ttlMs);
  }

  private getLimits(): { maxFilesPerDay: number; maxBytesPerDay: number } {
    const maxMb = this.readIntEnv('UPLOAD_MAX_MB_PER_USER_DAY', 100);
    return {
      maxFilesPerDay: this.readIntEnv('UPLOAD_MAX_FILES_PER_USER_DAY', 80),
      maxBytesPerDay: maxMb * 1024 * 1024,
    };
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
