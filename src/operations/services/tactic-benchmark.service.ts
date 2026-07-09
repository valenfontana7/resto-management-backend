import { Injectable } from '@nestjs/common';
import { BusinessMemoryCategory, BusinessMemoryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { parseResolutionMetadata } from '../utils/resolution-memory';
import {
  aggregateNetworkBenchmarks,
  formatBenchmarkComparison,
} from '../utils/tactic-benchmark.utils';
import { ResolutionMemoryService } from './resolution-memory.service';

@Injectable()
export class TacticBenchmarkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly resolutionMemory: ResolutionMemoryService,
  ) {}

  async getBenchmarkForRouting(restaurantId: string, situationType?: string) {
    if (!situationType?.trim()) return null;
    const result = await this.buildBenchmark(restaurantId, situationType);
    return result.benchmark;
  }

  async getBenchmark(
    restaurantId: string,
    userId: string,
    situationType: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    return this.buildBenchmark(restaurantId, situationType);
  }

  private async buildBenchmark(restaurantId: string, situationType: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { cuisineTypes: true, type: true },
    });

    const comparableTypes = new Set(
      (restaurant?.cuisineTypes ?? []).map((value) => value.toLowerCase()),
    );
    if (restaurant?.type) comparableTypes.add(restaurant.type.toLowerCase());

    const networkRows = await this.prisma.businessMemory.findMany({
      where: {
        status: BusinessMemoryStatus.ACTIVE,
        category: BusinessMemoryCategory.RESOLUTION_PATTERN,
        occurrenceCount: { gte: 2 },
      },
      select: {
        restaurantId: true,
        occurrenceCount: true,
        summary: true,
        metadata: true,
        restaurant: {
          select: { type: true, cuisineTypes: true },
        },
      },
      take: 500,
    });

    const comparableRows = networkRows.filter((row) => {
      if (comparableTypes.size === 0) return true;
      const rowTypes = [
        row.restaurant.type.toLowerCase(),
        ...row.restaurant.cuisineTypes.map((value) => value.toLowerCase()),
      ];
      return rowTypes.some((value) => comparableTypes.has(value));
    });

    const aggregate = aggregateNetworkBenchmarks(
      comparableRows.map((row) => ({
        restaurantId: row.restaurantId,
        occurrenceCount: row.occurrenceCount,
        summary: row.summary,
        metadata: row.metadata,
      })),
      situationType,
    );

    const localPrecedent = await this.resolutionMemory.getPrecedent(
      restaurantId,
      situationType,
    );

    if (!aggregate) {
      return {
        benchmark: null,
        local: localPrecedent,
        message:
          'Aún no hay suficientes locales comparables en la red (mínimo 3).',
      };
    }

    return {
      benchmark: {
        ...aggregate,
        comparison: formatBenchmarkComparison(
          localPrecedent?.successRate ?? null,
          aggregate.medianSuccessRate,
        ),
      },
      local: localPrecedent,
    };
  }

  async listForRestaurant(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const localPatterns = await this.prisma.businessMemory.findMany({
      where: {
        restaurantId,
        category: BusinessMemoryCategory.RESOLUTION_PATTERN,
        status: BusinessMemoryStatus.ACTIVE,
        occurrenceCount: { gte: 2 },
      },
      take: 5,
    });

    const benchmarks: Array<
      Awaited<ReturnType<TacticBenchmarkService['getBenchmark']>>
    > = [];
    for (const pattern of localPatterns) {
      const meta = parseResolutionMetadata(pattern.metadata);
      if (!meta?.situationType) continue;
      const result = await this.getBenchmark(
        restaurantId,
        userId,
        meta.situationType,
      );
      if (result.benchmark) benchmarks.push(result);
    }

    return { benchmarks };
  }
}
