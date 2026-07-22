import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BusinessMemoryCategory,
  BusinessMemoryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { LabBusinessDateService } from '../bentoo-lab/config/lab-business-date.service';
import {
  QueryBusinessMemoryDto,
  ResolveBusinessMemoryByKeysDto,
  SyncInsightMemoriesDto,
  UpsertBusinessMemoryDto,
} from './dto/business-memory.dto';
import {
  computeDefaultExpiresAt,
  daysBetween,
  isMemoryExpired,
  isSameUtcDay,
} from './business-memory.utils';

const INSIGHT_CATEGORY_MAP: Record<string, BusinessMemoryCategory> = {
  operational: BusinessMemoryCategory.OPERATIONAL,
  sales: BusinessMemoryCategory.SALES,
  inventory: BusinessMemoryCategory.INVENTORY,
  marketing: BusinessMemoryCategory.MARKETING,
  customer: BusinessMemoryCategory.CUSTOMER,
  configuration: BusinessMemoryCategory.CONFIGURATION,
  growth: BusinessMemoryCategory.GROWTH,
};

@Injectable()
export class BusinessMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    @Optional() private readonly labBusinessDate?: LabBusinessDateService,
  ) {}

  async query(
    restaurantId: string,
    userId: string,
    dto: QueryBusinessMemoryDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.expireStaleForRestaurant(restaurantId);

    const where: Prisma.BusinessMemoryWhereInput = {
      restaurantId,
    };

    if (dto.status) {
      where.status = dto.status;
    }
    if (dto.category) {
      where.category = dto.category;
    }
    if (dto.memoryKeys?.length) {
      where.memoryKey = { in: dto.memoryKeys };
    }
    if (dto.sinceDays) {
      const now = await this.resolveNow(restaurantId);
      const since = new Date(now);
      since.setDate(since.getDate() - dto.sinceDays);
      where.lastSeenAt = { gte: since };
    }

    const memories = await this.prisma.businessMemory.findMany({
      where,
      orderBy: [{ lastSeenAt: 'desc' }],
      take: dto.limit ?? 100,
    });

    return { memories: memories.map((memory) => this.toRecord(memory)) };
  }

  async getContext(restaurantId: string, userId: string, sinceDays = 7) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.expireStaleForRestaurant(restaurantId);

    const now = await this.resolveNow(restaurantId);
    const since = new Date(now);
    since.setDate(since.getDate() - sinceDays);

    const [active, recentlyResolved] = await Promise.all([
      this.prisma.businessMemory.findMany({
        where: {
          restaurantId,
          status: BusinessMemoryStatus.ACTIVE,
          NOT: [
            { memoryKey: { startsWith: 'narrative:' } },
            { memoryKey: { startsWith: 'action:' } },
            { sourceProvider: { in: ['narrative-engine', 'action-engine'] } },
          ],
        },
        orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }],
        take: 50,
      }),
      this.prisma.businessMemory.findMany({
        where: {
          restaurantId,
          status: BusinessMemoryStatus.RESOLVED,
          resolvedAt: { gte: since },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      active: active.map((memory) => this.toRecord(memory)),
      recentlyResolved: recentlyResolved.map((memory) => this.toRecord(memory)),
      sinceDays,
    };
  }

  async upsert(
    restaurantId: string,
    userId: string,
    dto: UpsertBusinessMemoryDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const now = new Date();
    const existing = await this.prisma.businessMemory.findUnique({
      where: {
        restaurantId_memoryKey: {
          restaurantId,
          memoryKey: dto.memoryKey,
        },
      },
    });

    if (!existing) {
      const created = await this.prisma.businessMemory.create({
        data: {
          restaurantId,
          memoryKey: dto.memoryKey,
          category: dto.category,
          status: BusinessMemoryStatus.ACTIVE,
          title: dto.title,
          summary: dto.summary,
          occurrenceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          sourceProvider: dto.sourceProvider,
          sourceInsightId: dto.sourceInsightId ?? dto.memoryKey,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          expiresAt: computeDefaultExpiresAt(dto.category, now),
        },
      });

      return { memory: this.toRecord(created), lifecycle: 'created' as const };
    }

    if (existing.status === BusinessMemoryStatus.EXPIRED) {
      const recreated = await this.prisma.businessMemory.update({
        where: { id: existing.id },
        data: {
          status: BusinessMemoryStatus.ACTIVE,
          title: dto.title,
          summary: dto.summary,
          occurrenceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          resolvedAt: null,
          resolvedBy: null,
          sourceProvider: dto.sourceProvider ?? existing.sourceProvider,
          sourceInsightId: dto.sourceInsightId ?? dto.memoryKey,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          expiresAt: computeDefaultExpiresAt(dto.category, now),
        },
      });

      return {
        memory: this.toRecord(recreated),
        lifecycle: 'created' as const,
      };
    }

    const sameDay = isSameUtcDay(existing.lastSeenAt, now);

    const updated = await this.prisma.businessMemory.update({
      where: { id: existing.id },
      data: {
        status: BusinessMemoryStatus.ACTIVE,
        title: dto.title,
        summary: dto.summary ?? existing.summary,
        ...(sameDay ? {} : { occurrenceCount: { increment: 1 } }),
        lastSeenAt: now,
        resolvedAt: null,
        resolvedBy: null,
        sourceProvider: dto.sourceProvider ?? existing.sourceProvider,
        sourceInsightId: dto.sourceInsightId ?? existing.sourceInsightId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        expiresAt: computeDefaultExpiresAt(dto.category, now),
      },
    });

    return { memory: this.toRecord(updated), lifecycle: 'updated' as const };
  }

  async incrementRecurrence(
    restaurantId: string,
    userId: string,
    memoryKey: string,
  ) {
    const memory = await this.prisma.businessMemory.findUnique({
      where: {
        restaurantId_memoryKey: { restaurantId, memoryKey },
      },
    });

    if (!memory) {
      throw new NotFoundException(`Memory ${memoryKey} not found`);
    }

    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const updated = await this.prisma.businessMemory.update({
      where: { id: memory.id },
      data: {
        occurrenceCount: { increment: 1 },
        lastSeenAt: new Date(),
        status: BusinessMemoryStatus.ACTIVE,
        resolvedAt: null,
        resolvedBy: null,
      },
    });

    return { memory: this.toRecord(updated), lifecycle: 'updated' as const };
  }

  async resolveById(restaurantId: string, userId: string, id: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const memory = await this.prisma.businessMemory.findFirst({
      where: { id, restaurantId },
    });

    if (!memory) {
      throw new NotFoundException('Memory not found');
    }

    const resolved = await this.prisma.businessMemory.update({
      where: { id: memory.id },
      data: {
        status: BusinessMemoryStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });

    return { memory: this.toRecord(resolved), lifecycle: 'resolved' as const };
  }

  async resolveByKeys(
    restaurantId: string,
    userId: string,
    dto: ResolveBusinessMemoryByKeysDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const where: Prisma.BusinessMemoryWhereInput = {
      restaurantId,
      status: BusinessMemoryStatus.ACTIVE,
    };

    if (dto.memoryKeys.length > 0) {
      where.memoryKey = { in: dto.memoryKeys };
    }
    if (dto.providerIds?.length) {
      where.sourceProvider = { in: dto.providerIds };
    }

    const result = await this.prisma.businessMemory.updateMany({
      where,
      data: {
        status: BusinessMemoryStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });

    return { resolvedCount: result.count, lifecycle: 'resolved' as const };
  }

  async resolveStaleForProviders(
    restaurantId: string,
    userId: string,
    activeMemoryKeys: string[],
    providerIds: string[],
  ) {
    if (providerIds.length === 0) {
      return { resolvedCount: 0 };
    }

    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const result = await this.prisma.businessMemory.updateMany({
      where: {
        restaurantId,
        status: BusinessMemoryStatus.ACTIVE,
        sourceProvider: { in: providerIds },
        memoryKey: { notIn: activeMemoryKeys },
      },
      data: {
        status: BusinessMemoryStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
    });

    return { resolvedCount: result.count };
  }

  async syncFromInsights(
    restaurantId: string,
    userId: string,
    dto: SyncInsightMemoriesDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const upserts = await Promise.all(
      dto.insights
        .filter(
          (insight) =>
            insight.providerId !== 'platform' &&
            !insight.id.startsWith('platform:'),
        )
        .map(async (insight) => {
          const category =
            INSIGHT_CATEGORY_MAP[insight.category.toLowerCase()] ??
            BusinessMemoryCategory.OPERATIONAL;

          return this.upsert(restaurantId, userId, {
            memoryKey: insight.id,
            category,
            title: insight.title,
            summary: insight.message,
            sourceProvider: insight.providerId,
            sourceInsightId: insight.id,
          });
        }),
    );

    const providerIds = dto.providerIds ?? [
      ...new Set(dto.insights.map((insight) => insight.providerId)),
    ];
    const activeKeys = dto.insights.map((insight) => insight.id);

    const resolved = await this.resolveStaleForProviders(
      restaurantId,
      userId,
      activeKeys,
      providerIds,
    );

    return { upserts, resolved };
  }

  async expireStaleForRestaurant(restaurantId: string) {
    const now = new Date();
    const result = await this.prisma.businessMemory.updateMany({
      where: {
        restaurantId,
        status: BusinessMemoryStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: {
        status: BusinessMemoryStatus.EXPIRED,
      },
    });

    return result.count;
  }

  toRecord(memory: {
    id: string;
    restaurantId: string;
    memoryKey: string;
    category: BusinessMemoryCategory;
    status: BusinessMemoryStatus;
    title: string;
    summary: string | null;
    occurrenceCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    expiresAt: Date | null;
    sourceProvider: string | null;
    sourceInsightId: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const now = new Date();
    const unresolvedDays =
      memory.status === BusinessMemoryStatus.ACTIVE
        ? daysBetween(memory.firstSeenAt, now)
        : memory.resolvedAt
          ? daysBetween(memory.firstSeenAt, memory.resolvedAt)
          : 0;

    return {
      id: memory.id,
      restaurantId: memory.restaurantId,
      memoryKey: memory.memoryKey,
      category: memory.category,
      status: isMemoryExpired(memory, now)
        ? BusinessMemoryStatus.EXPIRED
        : memory.status,
      title: memory.title,
      summary: memory.summary,
      occurrenceCount: memory.occurrenceCount,
      firstSeenAt: memory.firstSeenAt.toISOString(),
      lastSeenAt: memory.lastSeenAt.toISOString(),
      resolvedAt: memory.resolvedAt?.toISOString() ?? null,
      resolvedBy: memory.resolvedBy,
      expiresAt: memory.expiresAt?.toISOString() ?? null,
      sourceProvider: memory.sourceProvider,
      sourceInsightId: memory.sourceInsightId,
      metadata: memory.metadata,
      unresolvedDays,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    };
  }

  mapInsightCategory(category: string): BusinessMemoryCategory {
    const mapped = INSIGHT_CATEGORY_MAP[category.toLowerCase()];
    if (!mapped) {
      throw new BadRequestException(
        `Unsupported insight category: ${category}`,
      );
    }
    return mapped;
  }

  async resolveByKeysSystem(restaurantId: string, memoryKeys: string[]) {
    if (memoryKeys.length === 0) {
      return { resolvedCount: 0 };
    }

    const result = await this.prisma.businessMemory.updateMany({
      where: {
        restaurantId,
        status: BusinessMemoryStatus.ACTIVE,
        memoryKey: { in: memoryKeys },
      },
      data: {
        status: BusinessMemoryStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: null,
      },
    });

    return { resolvedCount: result.count };
  }

  /**
   * System-level upsert from business event subscribers — no user auth required.
   * Used by the reactive event bus, not by HTTP clients directly.
   */
  async recordFromBusinessEvent(
    restaurantId: string,
    dto: {
      memoryKey: string;
      category: BusinessMemoryCategory;
      title: string;
      summary?: string;
      sourceProvider?: string;
      sourceInsightId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const now = new Date();
    const existing = await this.prisma.businessMemory.findUnique({
      where: {
        restaurantId_memoryKey: {
          restaurantId,
          memoryKey: dto.memoryKey,
        },
      },
    });

    if (!existing) {
      const created = await this.prisma.businessMemory.create({
        data: {
          restaurantId,
          memoryKey: dto.memoryKey,
          category: dto.category,
          status: BusinessMemoryStatus.ACTIVE,
          title: dto.title,
          summary: dto.summary,
          occurrenceCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          sourceProvider: dto.sourceProvider ?? 'business-events',
          sourceInsightId: dto.sourceInsightId ?? dto.memoryKey,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          expiresAt: computeDefaultExpiresAt(dto.category, now),
        },
      });
      return { memory: this.toRecord(created), lifecycle: 'created' as const };
    }

    const sameDay = isSameUtcDay(existing.lastSeenAt, now);

    const updated = await this.prisma.businessMemory.update({
      where: { id: existing.id },
      data: {
        status: BusinessMemoryStatus.ACTIVE,
        title: dto.title,
        summary: dto.summary ?? existing.summary,
        ...(sameDay ? {} : { occurrenceCount: { increment: 1 } }),
        lastSeenAt: now,
        resolvedAt: null,
        resolvedBy: null,
        sourceProvider: dto.sourceProvider ?? existing.sourceProvider,
        sourceInsightId: dto.sourceInsightId ?? existing.sourceInsightId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        expiresAt: computeDefaultExpiresAt(dto.category, now),
      },
    });

    return { memory: this.toRecord(updated), lifecycle: 'updated' as const };
  }

  private async resolveNow(restaurantId: string): Promise<Date> {
    return (
      (await this.labBusinessDate?.resolveSimulatedNow(restaurantId)) ??
      new Date()
    );
  }
}
