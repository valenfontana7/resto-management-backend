import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class OnboardingAiQuotaService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertUserQuota(
    userId: string,
    action: 'draft' | 'menu',
  ): Promise<void> {
    const limits = this.getLimits();
    const limit = action === 'menu' ? limits.menuPerDay : limits.draftPerDay;
    const key = `ai-quota:${action}:${userId}:${this.todayKey()}`;
    const count = (await this.cache.get<number>(key)) ?? 0;

    if (count >= limit) {
      throw new HttpException(
        `Alcanzaste el límite diario de generación con IA (${limit}/día). Probá mañana o completá el onboarding manualmente.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cache.set(key, count + 1, 24 * 60 * 60 * 1000);
  }

  private getLimits(): { draftPerDay: number; menuPerDay: number } {
    return {
      draftPerDay: this.readIntEnv('ONBOARDING_AI_MAX_DRAFTS_PER_USER_DAY', 10),
      menuPerDay: this.readIntEnv(
        'ONBOARDING_AI_MAX_MENU_DRAFTS_PER_USER_DAY',
        10,
      ),
    };
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private readIntEnv(key: string, fallback: number): number {
    const raw = process.env[key]?.trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
