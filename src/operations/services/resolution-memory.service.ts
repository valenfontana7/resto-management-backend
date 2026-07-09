import { Injectable, Logger } from '@nestjs/common';
import {
  BusinessMemoryCategory,
  BusinessMemoryStatus,
  CoordinationPriority,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { BusinessMemoryService } from '../../business-memory/business-memory.service';
import {
  appendPrecedentDescription,
  applyPrioritySuppression,
  buildResolutionMemoryKey,
  computeSuccessRate,
  isIgnoredOutcome,
  parseResolutionMetadata,
  shouldPromotePattern,
  type ResolutionPatternMetadata,
  type ResolutionPrecedent,
} from '../utils/resolution-memory';

export interface EpisodeMemoryInput {
  restaurantId: string;
  episodeId: string;
  situationType?: string;
  daypart?: string;
  outcome: string;
  summary?: string | null;
  measuredImpact?: {
    metric: string;
    valueBefore?: number;
    valueAfter?: number;
    unit?: string;
  };
}

@Injectable()
export class ResolutionMemoryService {
  private readonly logger = new Logger(ResolutionMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly businessMemory: BusinessMemoryService,
  ) {}

  async listActivePatterns(restaurantId: string, userId: string, limit = 3) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const patterns = await this.getActivePatterns(restaurantId, limit);
    return { patterns };
  }

  async getPrecedent(
    restaurantId: string,
    situationType?: string,
    daypart?: string,
  ): Promise<ResolutionPrecedent | null> {
    if (!situationType?.trim()) return null;

    const memoryKey = buildResolutionMemoryKey(situationType, daypart);
    const memory = await this.prisma.businessMemory.findUnique({
      where: {
        restaurantId_memoryKey: { restaurantId, memoryKey },
      },
    });

    if (
      !memory ||
      memory.category !== BusinessMemoryCategory.RESOLUTION_PATTERN ||
      memory.status !== BusinessMemoryStatus.ACTIVE
    ) {
      return null;
    }

    const meta = parseResolutionMetadata(memory.metadata);
    if (!meta || memory.occurrenceCount < 2) {
      return null;
    }

    return {
      memoryKey,
      title: memory.title,
      summary: memory.summary,
      occurrenceCount: memory.occurrenceCount,
      successRate: meta.successRate,
      ignoreCount: meta.ignoreCount,
      medianImpact: meta.medianImpact,
      lastAppliedAt: meta.lastAppliedAt,
    };
  }

  applyRoutingAdjustments(
    input: {
      priority?: CoordinationPriority;
      description?: string;
      situationType?: string;
    },
    precedent: ResolutionPrecedent | null,
  ): {
    priority: CoordinationPriority;
    description?: string;
    precedent: ResolutionPrecedent | null;
    suppressed: boolean;
  } {
    let priority = input.priority ?? CoordinationPriority.HIGH;
    let suppressed = false;

    if (precedent && precedent.ignoreCount >= 3) {
      priority = applyPrioritySuppression(priority, precedent.ignoreCount);
      suppressed = true;
    }

    const description = precedent
      ? appendPrecedentDescription(input.description, precedent)
      : input.description;

    return { priority, description, precedent, suppressed };
  }

  async recordFromEpisode(input: EpisodeMemoryInput): Promise<void> {
    if (!input.situationType?.trim()) return;

    const memoryKey = buildResolutionMemoryKey(
      input.situationType,
      input.daypart,
    );

    if (isIgnoredOutcome(input.outcome, input.summary)) {
      await this.incrementIgnore(
        input.restaurantId,
        memoryKey,
        input.situationType,
        input.daypart,
      );
      return;
    }

    const resolved = input.outcome.toUpperCase() === 'RESOLVED';
    if (!resolved) return;

    try {
      const existing = await this.prisma.businessMemory.findUnique({
        where: {
          restaurantId_memoryKey: {
            restaurantId: input.restaurantId,
            memoryKey,
          },
        },
      });

      const prev = parseResolutionMetadata(existing?.metadata);
      const totalCount = (prev?.totalCount ?? 0) + 1;
      const successCount = (prev?.successCount ?? 0) + 1;
      const episodeIds = [...(prev?.episodeIds ?? []), input.episodeId].slice(
        -20,
      );

      const metadata: ResolutionPatternMetadata = {
        situationType: input.situationType,
        daypart: input.daypart,
        episodeIds,
        successCount,
        totalCount,
        successRate: computeSuccessRate(successCount, totalCount),
        ignoreCount: prev?.ignoreCount ?? 0,
        medianImpact: input.measuredImpact ?? prev?.medianImpact,
        lastAppliedAt: new Date().toISOString(),
        lastSummary: input.summary ?? prev?.lastSummary,
      };

      const nextOccurrence = (existing?.occurrenceCount ?? 0) + 1;
      if (
        !shouldPromotePattern({
          occurrenceCount: nextOccurrence,
          hasMeasuredImpact: Boolean(input.measuredImpact),
        })
      ) {
        await this.businessMemory.recordFromBusinessEvent(input.restaurantId, {
          memoryKey,
          category: BusinessMemoryCategory.RESOLUTION_PATTERN,
          title: this.buildTitle(input.situationType, input.daypart),
          summary:
            input.summary ??
            'Primera resolución registrada — se necesita más evidencia.',
          sourceProvider: 'operations.resolution-memory',
          sourceInsightId: input.episodeId,
          metadata: metadata as unknown as Record<string, unknown>,
        });
        return;
      }

      const summary =
        input.summary?.trim() ||
        existing?.summary ||
        `Patrón activo para ${input.situationType.replace(/-/g, ' ')}`;

      await this.businessMemory.recordFromBusinessEvent(input.restaurantId, {
        memoryKey,
        category: BusinessMemoryCategory.RESOLUTION_PATTERN,
        title: this.buildTitle(input.situationType, input.daypart),
        summary,
        sourceProvider: 'operations.resolution-memory',
        sourceInsightId: input.episodeId,
        metadata: metadata as unknown as Record<string, unknown>,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record resolution memory for ${input.situationType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async getRecurringPendings(restaurantId: string, limit = 5) {
    const memories = await this.prisma.businessMemory.findMany({
      where: {
        restaurantId,
        status: BusinessMemoryStatus.ACTIVE,
        occurrenceCount: { gte: 2 },
        OR: [
          { category: BusinessMemoryCategory.RESOLUTION_PATTERN },
          {
            category: BusinessMemoryCategory.OPERATIONAL,
            memoryKey: { startsWith: 'recurring:' },
          },
        ],
      },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: limit,
    });

    return memories.map((memory) => ({
      memoryKey: memory.memoryKey,
      title: memory.title,
      summary: memory.summary,
      occurrenceCount: memory.occurrenceCount,
      category: memory.category,
      lastSeenAt: memory.lastSeenAt.toISOString(),
    }));
  }

  async getActivePatterns(restaurantId: string, limit = 3) {
    const memories = await this.prisma.businessMemory.findMany({
      where: {
        restaurantId,
        status: BusinessMemoryStatus.ACTIVE,
        category: BusinessMemoryCategory.RESOLUTION_PATTERN,
        occurrenceCount: { gte: 2 },
      },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: limit,
    });

    return memories.map((memory) => {
      const meta = parseResolutionMetadata(memory.metadata);
      return {
        memoryKey: memory.memoryKey,
        title: memory.title,
        summary: memory.summary,
        occurrenceCount: memory.occurrenceCount,
        successRate: meta?.successRate ?? 0,
        medianImpact: meta?.medianImpact ?? null,
        lastSeenAt: memory.lastSeenAt.toISOString(),
      };
    });
  }

  private async incrementIgnore(
    restaurantId: string,
    memoryKey: string,
    situationType: string,
    daypart?: string,
  ): Promise<void> {
    const existing = await this.prisma.businessMemory.findUnique({
      where: { restaurantId_memoryKey: { restaurantId, memoryKey } },
    });

    const prev = parseResolutionMetadata(existing?.metadata);
    const ignoreCount = (prev?.ignoreCount ?? 0) + 1;
    const metadata: ResolutionPatternMetadata = {
      situationType,
      daypart,
      episodeIds: prev?.episodeIds ?? [],
      successCount: prev?.successCount ?? 0,
      totalCount: prev?.totalCount ?? 0,
      successRate: prev?.successRate ?? 0,
      ignoreCount,
      medianImpact: prev?.medianImpact,
      lastAppliedAt: prev?.lastAppliedAt,
      lastSummary: prev?.lastSummary,
    };

    await this.businessMemory.recordFromBusinessEvent(restaurantId, {
      memoryKey,
      category: BusinessMemoryCategory.RESOLUTION_PATTERN,
      title: this.buildTitle(situationType, daypart),
      summary:
        existing?.summary ??
        `Situación ${situationType.replace(/-/g, ' ')} — aprendiendo preferencias del equipo`,
      sourceProvider: 'operations.resolution-memory',
      metadata: metadata as unknown as Record<string, unknown>,
    });
  }

  private buildTitle(situationType: string, daypart?: string): string {
    const label = situationType.replace(/-/g, ' ');
    return daypart ? `${label} (${daypart.toLowerCase()})` : label;
  }
}
