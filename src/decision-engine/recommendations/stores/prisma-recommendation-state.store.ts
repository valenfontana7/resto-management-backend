import { Injectable } from '@nestjs/common';
import { IntelligenceStateKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ActiveRecommendationRecord } from '../types/recommendation.types';

/**
 * Persistencia Prisma de recomendaciones activas entre corridas.
 * Reemplaza a InMemoryRecommendationStateStore (R1) — sobrevive restarts.
 */
@Injectable()
export class PrismaRecommendationStateStore {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(restaurantId: string): Promise<ActiveRecommendationRecord[]> {
    const row = await this.prisma.restaurantIntelligenceState.findUnique({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.RECOMMENDATIONS,
        },
      },
    });
    if (!row) return [];
    return row.payload as unknown as ActiveRecommendationRecord[];
  }

  async setActive(
    restaurantId: string,
    recommendations: ActiveRecommendationRecord[],
  ): Promise<void> {
    await this.prisma.restaurantIntelligenceState.upsert({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.RECOMMENDATIONS,
        },
      },
      create: {
        restaurantId,
        kind: IntelligenceStateKind.RECOMMENDATIONS,
        payload: recommendations as unknown as Prisma.InputJsonValue,
      },
      update: {
        payload: recommendations as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
