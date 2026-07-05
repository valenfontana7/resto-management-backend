import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RestaurantIntelligenceBundle } from '../types/restaurant-intelligence-bundle.v1';

@Injectable()
export class IntelligenceSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    restaurantId: string,
  ): Promise<RestaurantIntelligenceBundle | null> {
    const row =
      await this.prisma.restaurantIntelligenceSnapshotCache.findUnique({
        where: { restaurantId },
      });
    if (!row) return null;
    return row.bundle as unknown as RestaurantIntelligenceBundle;
  }

  async set(bundle: RestaurantIntelligenceBundle): Promise<void> {
    const payload = bundle as unknown as Prisma.InputJsonValue;
    await this.prisma.restaurantIntelligenceSnapshotCache.upsert({
      where: { restaurantId: bundle.restaurantId },
      create: {
        restaurantId: bundle.restaurantId,
        contractVersion: bundle.contractVersion,
        bundle: payload,
        computedAt: new Date(bundle.computedAt),
      },
      update: {
        contractVersion: bundle.contractVersion,
        bundle: payload,
        computedAt: new Date(bundle.computedAt),
      },
    });
  }

  async getMany(
    restaurantIds: string[],
  ): Promise<Map<string, RestaurantIntelligenceBundle>> {
    if (restaurantIds.length === 0) return new Map();

    const rows = await this.prisma.restaurantIntelligenceSnapshotCache.findMany(
      {
        where: { restaurantId: { in: restaurantIds } },
      },
    );

    const result = new Map<string, RestaurantIntelligenceBundle>();
    for (const row of rows) {
      result.set(
        row.restaurantId,
        row.bundle as unknown as RestaurantIntelligenceBundle,
      );
    }
    return result;
  }
}
