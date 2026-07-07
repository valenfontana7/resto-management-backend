import { Injectable } from '@nestjs/common';
import { IntelligenceStateKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { OpenOpportunityRecord } from '../types/opportunity.types';

/**
 * Persistencia Prisma de oportunidades abiertas entre corridas.
 * Reemplaza a InMemoryOpportunityStateStore (R1) — sobrevive restarts.
 */
@Injectable()
export class PrismaOpportunityStateStore {
  constructor(private readonly prisma: PrismaService) {}

  async getOpen(restaurantId: string): Promise<OpenOpportunityRecord[]> {
    const row = await this.prisma.restaurantIntelligenceState.findUnique({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.OPPORTUNITIES,
        },
      },
    });
    if (!row) return [];
    return row.payload as unknown as OpenOpportunityRecord[];
  }

  async setOpen(
    restaurantId: string,
    opportunities: OpenOpportunityRecord[],
  ): Promise<void> {
    await this.prisma.restaurantIntelligenceState.upsert({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.OPPORTUNITIES,
        },
      },
      create: {
        restaurantId,
        kind: IntelligenceStateKind.OPPORTUNITIES,
        payload: opportunities as unknown as Prisma.InputJsonValue,
      },
      update: {
        payload: opportunities as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
