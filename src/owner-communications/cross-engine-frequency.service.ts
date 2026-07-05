import { Injectable } from '@nestjs/common';
import {
  EngagementDeliveryStatus,
  LifecycleDeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getCrossEngineGlobalCap,
  getRecommendationOwnership,
  type OwnerCommunicationEngine,
} from './catalog/cross-engine-coordination.loader';

export interface CrossEngineCapDecision {
  allowed: boolean;
  reason: string;
  recentCount: number;
  maxMessages: number;
  windowDays: number;
}

export interface CrossEngineOwnershipDecision {
  allowed: boolean;
  reason: string;
  primaryEngine: OwnerCommunicationEngine | null;
}

export interface CrossEngineRecommendationDedupDecision {
  allowed: boolean;
  reason: string;
  daysSinceLastContact: number | null;
  lastEngine: OwnerCommunicationEngine | null;
}

const CE_COUNTABLE: EngagementDeliveryStatus[] = [
  'SCHEDULED',
  'QUEUED',
  'SENT',
  'SIMULATED',
];

const LCM_COUNTABLE: LifecycleDeliveryStatus[] = [
  'SCHEDULED',
  'QUEUED',
  'SENT',
  'SIMULATED',
];

@Injectable()
export class CrossEngineFrequencyService {
  constructor(private readonly prisma: PrismaService) {}

  getGlobalCap() {
    return getCrossEngineGlobalCap();
  }

  assertEngineOwnership(
    recommendationCode: string,
    engine: OwnerCommunicationEngine,
  ): CrossEngineOwnershipDecision {
    const rule = getRecommendationOwnership(recommendationCode);
    if (!rule) {
      return {
        allowed: true,
        reason: 'Sin regla de ownership — ambos motores pueden evaluar',
        primaryEngine: null,
      };
    }

    if (rule.primaryEngine !== engine) {
      return {
        allowed: false,
        reason: `REC ${recommendationCode} owned by ${rule.primaryEngine}: ${rule.reason}`,
        primaryEngine: rule.primaryEngine,
      };
    }

    return {
      allowed: true,
      reason: `Motor primario para ${recommendationCode}`,
      primaryEngine: rule.primaryEngine,
    };
  }

  async evaluateGlobalCap(
    restaurantId: string,
    windowDays?: number,
  ): Promise<CrossEngineCapDecision> {
    const cap = getCrossEngineGlobalCap();
    const days = windowDays ?? cap.days;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentCount = await this.countRecentCommunications(
      restaurantId,
      since,
    );

    if (recentCount >= cap.maxMessages) {
      return {
        allowed: false,
        reason: `Cap cross-engine: ${recentCount}/${cap.maxMessages} comunicaciones en ${days}d (CE + LCM)`,
        recentCount,
        maxMessages: cap.maxMessages,
        windowDays: days,
      };
    }

    return {
      allowed: true,
      reason: 'Cap cross-engine OK',
      recentCount,
      maxMessages: cap.maxMessages,
      windowDays: days,
    };
  }

  async evaluateRecommendationDedup(
    restaurantId: string,
    recommendationCode: string,
    minDays?: number,
  ): Promise<CrossEngineRecommendationDedupDecision> {
    const cap = getCrossEngineGlobalCap();
    const threshold = minDays ?? cap.minDaysBetweenSameRecommendation;
    const daysSince = await this.daysSinceLastContactForRecommendation(
      restaurantId,
      recommendationCode,
    );

    if (daysSince != null && daysSince < threshold) {
      const last = await this.findLastContactForRecommendation(
        restaurantId,
        recommendationCode,
      );
      return {
        allowed: false,
        reason: `REC ${recommendationCode} contactada hace ${daysSince}d vía ${last?.engine ?? 'unknown'} (mín ${threshold}d cross-engine)`,
        daysSinceLastContact: daysSince,
        lastEngine: last?.engine ?? null,
      };
    }

    return {
      allowed: true,
      reason: 'Dedup REC OK',
      daysSinceLastContact: daysSince,
      lastEngine: null,
    };
  }

  async countRecentCommunications(
    restaurantId: string,
    since: Date,
  ): Promise<number> {
    const [ce, lcm] = await Promise.all([
      this.prisma.engagementDelivery.count({
        where: {
          restaurantId,
          createdAt: { gte: since },
          status: { in: CE_COUNTABLE },
        },
      }),
      this.prisma.lifecycleDelivery.count({
        where: {
          restaurantId,
          createdAt: { gte: since },
          status: { in: LCM_COUNTABLE },
        },
      }),
    ]);
    return ce + lcm;
  }

  async daysSinceLastContactForRecommendation(
    restaurantId: string,
    recommendationCode: string,
  ): Promise<number | null> {
    const last = await this.findLastContactForRecommendation(
      restaurantId,
      recommendationCode,
    );
    if (!last) return null;
    return Math.floor(
      (Date.now() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  private async findLastContactForRecommendation(
    restaurantId: string,
    recommendationCode: string,
  ): Promise<{
    createdAt: Date;
    engine: OwnerCommunicationEngine;
  } | null> {
    const [ceRow, lcmRow] = await Promise.all([
      this.prisma.engagementDelivery.findFirst({
        where: {
          restaurantId,
          recommendationCode,
          status: { in: CE_COUNTABLE },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.lifecycleDelivery.findFirst({
        where: {
          restaurantId,
          recommendationCode,
          status: { in: LCM_COUNTABLE },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    if (!ceRow && !lcmRow) return null;
    if (ceRow && !lcmRow) {
      return { createdAt: ceRow.createdAt, engine: 'customer_engagement' };
    }
    if (!ceRow && lcmRow) {
      return { createdAt: lcmRow.createdAt, engine: 'lifecycle_marketing' };
    }

    const ceTime = ceRow!.createdAt.getTime();
    const lcmTime = lcmRow!.createdAt.getTime();
    return ceTime >= lcmTime
      ? { createdAt: ceRow!.createdAt, engine: 'customer_engagement' }
      : { createdAt: lcmRow!.createdAt, engine: 'lifecycle_marketing' };
  }
}
