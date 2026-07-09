import { Injectable } from '@nestjs/common';
import { BusinessMemoryCategory, CoordinationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseResolutionMetadata } from '../utils/resolution-memory';

export interface ShiftLearningRecap {
  episodesTotal: number;
  episodesWithImpact: number;
  patternsReinforced: Array<{
    memoryKey: string;
    title: string;
    summary: string | null;
    occurrenceCount: number;
    successRate: number;
  }>;
  impactHighlights: Array<{
    coordinationId: string | null;
    metric: string;
    valueBefore?: number;
    valueAfter?: number;
    unit?: string;
    summary?: string | null;
  }>;
  coordinationStats: {
    total: number;
    resolved: number;
    expired: number;
    escalated: number;
    intelligenceResolved: number;
  };
}

@Injectable()
export class ShiftRecapService {
  constructor(private readonly prisma: PrismaService) {}

  async buildLearningRecap(
    restaurantId: string,
    shiftId: string,
    openedAt: Date,
    closedAt: Date,
  ): Promise<ShiftLearningRecap> {
    const [episodes, coordinations, reinforced] = await Promise.all([
      this.prisma.operationalEpisode.findMany({
        where: { restaurantId, shiftId },
        select: {
          id: true,
          coordinationId: true,
          outcome: true,
        },
      }),
      this.prisma.coordination.findMany({
        where: { restaurantId, shiftId },
        select: {
          id: true,
          status: true,
          escalatedToShiftLead: true,
          origin: true,
        },
      }),
      this.prisma.businessMemory.findMany({
        where: {
          restaurantId,
          category: BusinessMemoryCategory.RESOLUTION_PATTERN,
          lastSeenAt: { gte: openedAt, lte: closedAt },
        },
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
      }),
    ]);

    const impactHighlights = episodes
      .map((episode) => {
        const outcome =
          episode.outcome && typeof episode.outcome === 'object'
            ? (episode.outcome as {
                measuredImpact?: {
                  metric: string;
                  valueBefore?: number;
                  valueAfter?: number;
                  unit?: string;
                };
                summary?: string | null;
              })
            : null;
        if (!outcome?.measuredImpact?.metric) return null;
        return {
          coordinationId: episode.coordinationId,
          metric: outcome.measuredImpact.metric,
          valueBefore: outcome.measuredImpact.valueBefore,
          valueAfter: outcome.measuredImpact.valueAfter,
          unit: outcome.measuredImpact.unit,
          summary: outcome.summary ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .slice(0, 5);

    const intelligenceResolved = coordinations.filter((coord) => {
      if (coord.status !== CoordinationStatus.RESOLVED) return false;
      const origin =
        coord.origin && typeof coord.origin === 'object'
          ? (coord.origin as { kind?: string })
          : null;
      return origin?.kind === 'INTELLIGENCE';
    }).length;

    return {
      episodesTotal: episodes.length,
      episodesWithImpact: impactHighlights.length,
      patternsReinforced: reinforced.map((memory) => {
        const meta = parseResolutionMetadata(memory.metadata);
        return {
          memoryKey: memory.memoryKey,
          title: memory.title,
          summary: memory.summary,
          occurrenceCount: memory.occurrenceCount,
          successRate: meta?.successRate ?? 0,
        };
      }),
      impactHighlights,
      coordinationStats: {
        total: coordinations.length,
        resolved: coordinations.filter(
          (c) => c.status === CoordinationStatus.RESOLVED,
        ).length,
        expired: coordinations.filter(
          (c) => c.status === CoordinationStatus.EXPIRED,
        ).length,
        escalated: coordinations.filter((c) => c.escalatedToShiftLead).length,
        intelligenceResolved,
      },
    };
  }
}
