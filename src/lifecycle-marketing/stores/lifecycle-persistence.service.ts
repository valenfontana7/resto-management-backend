import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  LifecycleDashboardStats,
  LifecycleDeliveryRecord,
  LifecycleDeliveryStatus,
  LifecycleOutcomeRecord,
  LifecycleOutcomeType,
} from '../types/delivery.types';
import type { LifecycleCampaignType } from '../types/campaign.types';
import {
  mapDeliveryRow,
  mapOutcomeRow,
  toPrismaDeliveryStatus,
  toPrismaOutcomeType,
  type SaveCampaignRunInput,
  type SaveLifecycleDeliveryInput,
} from './lifecycle-persistence.mapper';

@Injectable()
export class LifecyclePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async saveCampaignRun(input: SaveCampaignRunInput): Promise<void> {
    await this.prisma.lifecycleCampaignRun.create({
      data: {
        id: input.id,
        restaurantId: input.restaurantId,
        campaignId: input.campaignId,
        campaignType: input.campaignType,
        recommendationCode: input.recommendationCode,
        opportunityCode: input.opportunityCode,
        shouldCommunicate: input.shouldCommunicate,
        reason: input.reason,
        intelligenceBacked: input.intelligenceBacked,
        channel: input.channel,
        templateId: input.templateId,
        decisionTrace: input.trace as object,
        engineVersion: input.engineVersion,
      },
    });
  }

  async saveDelivery(
    input: SaveLifecycleDeliveryInput,
  ): Promise<LifecycleDeliveryRecord> {
    const row = await this.prisma.lifecycleDelivery.create({
      data: {
        id: input.id,
        restaurantId: input.restaurantId,
        campaignRunId: input.campaignRunId,
        campaignId: input.campaignId,
        campaignType: input.campaignType,
        stepId: input.stepId,
        recommendationCode: input.recommendationCode,
        opportunityCode: input.opportunityCode,
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
    status: LifecycleDeliveryStatus,
    extra?: {
      sentAt?: Date;
      externalMessageId?: string;
      errorMessage?: string;
    },
  ): Promise<LifecycleDeliveryRecord | null> {
    const row = await this.prisma.lifecycleDelivery.update({
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

  async getDelivery(id: string): Promise<LifecycleDeliveryRecord | null> {
    const row = await this.prisma.lifecycleDelivery.findUnique({
      where: { id },
    });
    return row ? mapDeliveryRow(row) : null;
  }

  async getDeliveryWithBody(id: string) {
    return this.prisma.lifecycleDelivery.findUnique({
      where: { id },
      include: { restaurant: { select: { name: true } } },
    });
  }

  async listDeliveriesForRestaurant(
    restaurantId: string,
    limit = 50,
  ): Promise<LifecycleDeliveryRecord[]> {
    const rows = await this.prisma.lifecycleDelivery.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapDeliveryRow);
  }

  async listRecentDeliveries(
    restaurantId: string,
    since: Date,
  ): Promise<LifecycleDeliveryRecord[]> {
    const rows = await this.prisma.lifecycleDelivery.findMany({
      where: { restaurantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapDeliveryRow);
  }

  async daysSinceLastDeliveryForCampaign(
    restaurantId: string,
    campaignId: string,
  ): Promise<number | null> {
    const latest = await this.prisma.lifecycleDelivery.findFirst({
      where: { restaurantId, campaignId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return null;
    return Math.floor(
      (Date.now() - latest.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  async countDeliveriesForCampaign(
    restaurantId: string,
    campaignId: string,
  ): Promise<number> {
    return this.prisma.lifecycleDelivery.count({
      where: {
        restaurantId,
        campaignId,
        status: { in: ['SCHEDULED', 'SENT', 'SIMULATED', 'QUEUED'] },
      },
    });
  }

  async listDueDeliveries(limit = 100): Promise<LifecycleDeliveryRecord[]> {
    const rows = await this.prisma.lifecycleDelivery.findMany({
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
    campaignId: string;
    campaignType: string;
    type: LifecycleOutcomeType;
    rssBefore?: number | null;
    rssAfter?: number | null;
    rssDelta?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<LifecycleOutcomeRecord> {
    const row = await this.prisma.lifecycleOutcome.create({
      data: {
        id: input.id,
        deliveryId: input.deliveryId,
        restaurantId: input.restaurantId,
        campaignId: input.campaignId,
        campaignType: input.campaignType,
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
  ): Promise<LifecycleOutcomeRecord[]> {
    const rows = await this.prisma.lifecycleOutcome.findMany({
      where: { restaurantId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return rows.map(mapOutcomeRow);
  }

  async listOutcomesForDelivery(
    deliveryId: string,
  ): Promise<LifecycleOutcomeRecord[]> {
    const rows = await this.prisma.lifecycleOutcome.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map(mapOutcomeRow);
  }

  async listActiveCampaignTypes(
    restaurantId: string,
  ): Promise<LifecycleCampaignType[]> {
    const rows = await this.prisma.lifecycleActiveCampaign.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { campaignType: true },
    });
    return rows.map((r) => r.campaignType as LifecycleCampaignType);
  }

  async upsertActiveCampaign(input: {
    restaurantId: string;
    campaignId: string;
    campaignType: LifecycleCampaignType;
    sourceRecommendationCode: string | null;
    sourceOpportunityCode: string | null;
    currentStepIndex: number;
  }): Promise<void> {
    const existing = await this.prisma.lifecycleActiveCampaign.findFirst({
      where: {
        restaurantId: input.restaurantId,
        campaignId: input.campaignId,
        status: 'ACTIVE',
      },
    });

    if (existing) {
      await this.prisma.lifecycleActiveCampaign.update({
        where: { id: existing.id },
        data: {
          currentStepIndex: input.currentStepIndex,
          lastTouchAt: new Date(),
        },
      });
      return;
    }

    await this.prisma.lifecycleActiveCampaign.create({
      data: {
        restaurantId: input.restaurantId,
        campaignId: input.campaignId,
        campaignType: input.campaignType,
        sourceRecommendationCode: input.sourceRecommendationCode,
        sourceOpportunityCode: input.sourceOpportunityCode,
        currentStepIndex: input.currentStepIndex,
        status: 'ACTIVE',
      },
    });
  }

  async completeActiveCampaign(
    restaurantId: string,
    campaignId: string,
  ): Promise<void> {
    await this.prisma.lifecycleActiveCampaign.updateMany({
      where: { restaurantId, campaignId, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async hasCampaignStepDelivery(
    restaurantId: string,
    campaignId: string,
    stepId: string,
  ): Promise<boolean> {
    const count = await this.prisma.lifecycleDelivery.count({
      where: {
        restaurantId,
        campaignId,
        stepId,
        status: { in: ['SCHEDULED', 'SENT', 'SIMULATED', 'QUEUED'] },
      },
    });
    return count > 0;
  }

  async getDashboardStats(days = 7): Promise<LifecycleDashboardStats> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [deliveries, outcomes, activeCampaigns, suppressedRuns] =
      await Promise.all([
        this.prisma.lifecycleDelivery.findMany({
          where: { createdAt: { gte: since } },
          select: { status: true },
        }),
        this.prisma.lifecycleOutcome.findMany({
          where: { recordedAt: { gte: since } },
          select: { type: true },
        }),
        this.prisma.lifecycleActiveCampaign.count({
          where: { status: 'ACTIVE' },
        }),
        this.prisma.lifecycleCampaignRun.count({
          where: {
            decidedAt: { gte: since },
            shouldCommunicate: false,
          },
        }),
      ]);

    const sent = deliveries.filter((d) =>
      ['SENT', 'SIMULATED'].includes(d.status),
    ).length;
    const opened = outcomes.filter((o) => o.type === 'OPENED').length;
    const clicked = outcomes.filter((o) => o.type === 'CLICKED').length;
    const goalCompleted = outcomes.filter(
      (o) => o.type === 'GOAL_COMPLETED',
    ).length;
    const journeyCompleted = outcomes.filter(
      (o) => o.type === 'JOURNEY_COMPLETED',
    ).length;

    return {
      days,
      sent,
      opened,
      clicked,
      goalCompleted,
      openRate: sent > 0 ? opened / sent : 0,
      clickRate: sent > 0 ? clicked / sent : 0,
      journeyCompletionRate: sent > 0 ? journeyCompleted / sent : 0,
      activeCampaigns,
      suppressed: suppressedRuns,
      ttvMedianDays: null,
      activationRate: null,
      retentionRate: null,
      recoveryRate: null,
      referralRate: null,
    };
  }

  async listRecentDeliveriesGlobal(limit = 30) {
    const rows = await this.prisma.lifecycleDelivery.findMany({
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

  async listScheduledCalendar(from: Date, to: Date) {
    const rows = await this.prisma.lifecycleDelivery.findMany({
      where: {
        deliverAt: { gte: from, lte: to },
        status: 'SCHEDULED',
      },
      orderBy: { deliverAt: 'asc' },
      include: {
        restaurant: { select: { name: true, slug: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      deliverAt: row.deliverAt.toISOString(),
      campaignId: row.campaignId,
      campaignType: row.campaignType,
      channel: row.channel,
      restaurantName: row.restaurant.name,
      restaurantSlug: row.restaurant.slug,
    }));
  }
}
