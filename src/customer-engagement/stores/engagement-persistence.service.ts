import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ScheduledDelivery,
  DeliveryStatus,
} from '../types/delivery.types';
import type {
  EngagementOutcomeRecord,
  EngagementOutcomeType,
} from '../types/outcome.types';
import {
  mapDeliveryRow,
  mapOutcomeRow,
  toPrismaDeliveryStatus,
  toPrismaOutcomeType,
  type SaveDecisionInput,
  type SaveDeliveryInput,
} from './engagement-persistence.mapper';

@Injectable()
export class EngagementPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async saveDecision(input: SaveDecisionInput): Promise<void> {
    await this.prisma.engagementDecisionRecord.create({
      data: {
        id: input.id,
        restaurantId: input.restaurantId,
        recommendationId: input.recommendationId,
        recommendationCode: input.recommendationCode,
        policyId: input.policyId,
        shouldCommunicate: input.shouldCommunicate,
        policyReason: input.policyReason,
        journeyId: input.journeyId,
        channel: input.channel,
        templateId: input.templateId,
        decisionTrace: input.trace as object,
        engineVersion: input.engineVersion,
      },
    });
  }

  async saveDelivery(input: SaveDeliveryInput): Promise<ScheduledDelivery> {
    const row = await this.prisma.engagementDelivery.create({
      data: {
        id: input.id,
        restaurantId: input.restaurantId,
        decisionId: input.decisionId,
        recommendationId: input.recommendationId,
        recommendationCode: input.recommendationCode,
        policyId: input.policyId,
        journeyId: input.journeyId,
        journeyStepId: input.journeyStepId,
        templateId: input.templateId,
        channel: input.channel,
        status: toPrismaDeliveryStatus(input.status),
        recipient: input.recipient,
        subject: input.subject,
        bodyPreview: input.bodyPreview,
        bodyFull: input.bodyFull,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
        scheduledAt: input.scheduledAt,
        deliverAt: input.deliverAt,
        sentAt: input.sentAt ?? null,
        externalMessageId: input.externalMessageId ?? null,
        errorMessage: input.errorMessage ?? null,
        engineVersion: input.engineVersion,
      },
    });
    return mapDeliveryRow(row);
  }

  async updateDeliveryStatus(
    id: string,
    status: DeliveryStatus,
    extra?: {
      sentAt?: Date;
      externalMessageId?: string;
      errorMessage?: string;
    },
  ): Promise<ScheduledDelivery | null> {
    const row = await this.prisma.engagementDelivery.update({
      where: { id },
      data: {
        status: toPrismaDeliveryStatus(status),
        sentAt: extra?.sentAt,
        externalMessageId: extra?.externalMessageId,
        errorMessage: extra?.errorMessage,
      },
    });
    return mapDeliveryRow(row);
  }

  async getDelivery(id: string): Promise<ScheduledDelivery | null> {
    const row = await this.prisma.engagementDelivery.findUnique({
      where: { id },
    });
    return row ? mapDeliveryRow(row) : null;
  }

  async getDeliveryWithBody(id: string) {
    return this.prisma.engagementDelivery.findUnique({
      where: { id },
      include: { restaurant: { select: { name: true } } },
    });
  }

  async listDeliveriesForRestaurant(
    restaurantId: string,
    limit = 50,
  ): Promise<ScheduledDelivery[]> {
    const rows = await this.prisma.engagementDelivery.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapDeliveryRow);
  }

  async listRecentDeliveries(
    restaurantId: string,
    since: Date,
  ): Promise<ScheduledDelivery[]> {
    const rows = await this.prisma.engagementDelivery.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapDeliveryRow);
  }

  async daysSinceLastDeliveryForRecommendation(
    restaurantId: string,
    recommendationCode: string,
  ): Promise<number | null> {
    const latest = await this.prisma.engagementDelivery.findFirst({
      where: { restaurantId, recommendationCode },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return null;
    const diffMs = Date.now() - latest.createdAt.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  async listDueDeliveries(limit = 100): Promise<ScheduledDelivery[]> {
    const rows = await this.prisma.engagementDelivery.findMany({
      where: {
        status: 'SCHEDULED',
        deliverAt: { lte: new Date() },
      },
      orderBy: { deliverAt: 'asc' },
      take: limit,
    });
    return rows.map(mapDeliveryRow);
  }

  async saveOutcome(input: {
    id: string;
    deliveryId: string;
    restaurantId: string;
    recommendationCode: string;
    type: EngagementOutcomeType;
    rssBefore?: number | null;
    rssAfter?: number | null;
    rssDelta?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<EngagementOutcomeRecord> {
    const row = await this.prisma.engagementOutcome.create({
      data: {
        id: input.id,
        deliveryId: input.deliveryId,
        restaurantId: input.restaurantId,
        recommendationCode: input.recommendationCode,
        type: toPrismaOutcomeType(input.type),
        rssBefore: input.rssBefore ?? null,
        rssAfter: input.rssAfter ?? null,
        rssDelta: input.rssDelta ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
    return mapOutcomeRow(row);
  }

  async listOutcomesForRestaurant(
    restaurantId: string,
    limit = 100,
  ): Promise<EngagementOutcomeRecord[]> {
    const rows = await this.prisma.engagementOutcome.findMany({
      where: { restaurantId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return rows.map(mapOutcomeRow);
  }

  async listOutcomesForDelivery(
    deliveryId: string,
  ): Promise<EngagementOutcomeRecord[]> {
    const rows = await this.prisma.engagementOutcome.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map(mapOutcomeRow);
  }

  async getDashboardStats(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [deliveries, outcomes, decisions, activeJourneys] = await Promise.all(
      [
        this.prisma.engagementDelivery.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.engagementOutcome.groupBy({
          by: ['type'],
          where: { recordedAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.engagementDecisionRecord.count({
          where: { decidedAt: { gte: since }, shouldCommunicate: true },
        }),
        this.prisma.engagementActiveJourney.count({
          where: { status: 'ACTIVE' },
        }),
      ],
    );

    const sent = await this.prisma.engagementDelivery.count({
      where: {
        createdAt: { gte: since },
        status: { in: ['SENT', 'SIMULATED'] },
      },
    });

    return {
      periodDays: days,
      since: since.toISOString(),
      deliveriesTotal: deliveries,
      deliveriesSent: sent,
      decisionsToCommunicate: decisions,
      activeJourneys,
      outcomesByType: outcomes.map((row) => ({
        type: row.type,
        count: row._count._all,
      })),
    };
  }

  async listRecentDeliveriesGlobal(limit = 30) {
    const rows = await this.prisma.engagementDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
      },
    });
    return rows.map((row) => ({
      ...mapDeliveryRow(row),
      restaurantName: row.restaurant.name,
      restaurantSlug: row.restaurant.slug,
    }));
  }

  async findDeliveryByExternalMessageId(
    externalMessageId: string,
  ): Promise<ScheduledDelivery | null> {
    const row = await this.prisma.engagementDelivery.findFirst({
      where: { externalMessageId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapDeliveryRow(row) : null;
  }

  async hasJourneyStepDelivery(
    restaurantId: string,
    journeyId: string,
    journeyStepId: string,
  ): Promise<boolean> {
    const count = await this.prisma.engagementDelivery.count({
      where: {
        restaurantId,
        journeyId,
        journeyStepId,
        status: { in: ['SCHEDULED', 'SENT', 'SIMULATED', 'QUEUED'] },
      },
    });
    return count > 0;
  }
}
