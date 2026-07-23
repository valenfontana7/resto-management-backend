import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export type AiQuotaAction = 'draft' | 'menu' | 'discover' | 'builder';

export interface AiQuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

@Injectable()
export class OnboardingAiQuotaService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertUserQuota(userId: string, action: AiQuotaAction): Promise<void> {
    await this.checkUserQuota(userId, action);
    await this.incrementUserQuota(userId, action);
  }

  async checkUserQuota(userId: string, action: AiQuotaAction): Promise<void> {
    const status = await this.getUserQuotaStatus(userId, action);
    if (status.remaining <= 0) {
      throw this.buildQuotaExceededException(action, status.limit);
    }
  }

  async incrementUserQuota(
    userId: string,
    action: AiQuotaAction,
  ): Promise<void> {
    const key = this.quotaKey(userId, action);
    const count = (await this.cache.get<number>(key)) ?? 0;
    await this.cache.set(key, count + 1, 24 * 60 * 60 * 1000);
  }

  async getUserQuotaStatus(
    userId: string,
    action: AiQuotaAction,
  ): Promise<AiQuotaStatus> {
    const limit = this.getLimit(action);
    const key = this.quotaKey(userId, action);
    const used = (await this.cache.get<number>(key)) ?? 0;
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: this.nextResetAt(),
    };
  }

  private buildQuotaExceededException(
    action: AiQuotaAction,
    limit: number,
  ): HttpException {
    if (action === 'discover') {
      return new HttpException(
        {
          message: `Alcanzaste el límite diario de búsquedas con IA (${limit}/día). Probá mañana.`,
          code: 'LEADS_DISCOVERY_QUOTA_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (action === 'builder') {
      return new HttpException(
        {
          message: `Alcanzaste el límite diario de IA del builder (${limit}/día). Probá mañana.`,
          code: 'BUILDER_AI_QUOTA_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return new HttpException(
      {
        message: `Alcanzaste el límite diario de generación con IA (${limit}/día). Probá mañana o completá el onboarding manualmente.`,
        code: 'ONBOARDING_AI_QUOTA_EXCEEDED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getLimit(action: AiQuotaAction): number {
    const limits = this.getLimits();
    if (action === 'menu') return limits.menuPerDay;
    if (action === 'discover') return limits.discoverPerDay;
    if (action === 'builder') return limits.builderPerDay;
    return limits.draftPerDay;
  }

  private quotaKey(userId: string, action: AiQuotaAction): string {
    return `ai-quota:${action}:${userId}:${this.todayKey()}`;
  }

  private nextResetAt(): string {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  private getLimits(): {
    draftPerDay: number;
    menuPerDay: number;
    discoverPerDay: number;
    builderPerDay: number;
  } {
    return {
      draftPerDay: this.readIntEnv('ONBOARDING_AI_MAX_DRAFTS_PER_USER_DAY', 10),
      menuPerDay: this.readIntEnv(
        'ONBOARDING_AI_MAX_MENU_DRAFTS_PER_USER_DAY',
        10,
      ),
      discoverPerDay: this.readIntEnv(
        'LEADS_AI_MAX_DISCOVERIES_PER_USER_DAY',
        5,
      ),
      builderPerDay: this.readIntEnv('BUILDER_AI_MAX_PER_USER_DAY', 30),
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
