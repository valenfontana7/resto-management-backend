import { Injectable } from '@nestjs/common';
import {
  EngagementDeliveryStatus,
  LifecycleDeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  listCampaigns,
  getCampaignById,
} from '../catalog/campaign-catalog.loader';
import { TemplateOverrideService } from './template-override.service';

const SENT_STATUSES_CE: EngagementDeliveryStatus[] = ['SENT', 'SIMULATED'];
const SENT_STATUSES_LCM: LifecycleDeliveryStatus[] = ['SENT', 'SIMULATED'];

const RECOVERY_CAMPAIGN_TYPES = ['WINBACK', 'RECOVERY', 'INACTIVITY'] as const;

export const WELCOME_TEMPLATE_ID = 'LMT-WELCOME-01';
export const WINBACK_CAMPAIGN_ID = 'LCM-WINBACK-01';

@Injectable()
export class MarketingDirectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateOverrideService,
  ) {}

  async getCommandCenter() {
    const now = new Date();
    const startOfToday = this.startOfDay(now);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const [
      emailsToday,
      emailsYesterday,
      recoveredThisWeek,
      runningCampaigns,
      winback,
      welcomeTemplate,
    ] = await Promise.all([
      this.listEmailsToday(startOfToday),
      this.countEmailsBetween(startOfYesterday, startOfToday),
      this.countRecoveredRestaurants(startOfWeek),
      this.getRunningCampaignsSummary(startOfWeek),
      this.getCampaignPerformance(WINBACK_CAMPAIGN_ID, 7),
      this.templates.getEffectiveTemplate(WELCOME_TEMPLATE_ID),
    ]);

    const emailsTodayCount = emailsToday.length;
    const delta =
      emailsYesterday > 0
        ? (emailsTodayCount - emailsYesterday) / emailsYesterday
        : emailsTodayCount > 0
          ? 1
          : 0;

    const activeInstances = runningCampaigns.reduce(
      (sum, c) => sum + c.activeRestaurants,
      0,
    );

    return {
      generatedAt: now.toISOString(),
      kpis: {
        emailsToday: emailsTodayCount,
        emailsTodayDelta: delta,
        restaurantsRecoveredThisWeek: recoveredThisWeek,
        activeCampaignInstances: activeInstances,
        uniqueCampaignsRunning: runningCampaigns.filter(
          (c) => c.activeRestaurants > 0,
        ).length,
        openRate7d: winback.openRate,
      },
      runningCampaigns,
      emailsToday,
      winback,
      welcomeTemplate,
    };
  }

  async getRunningCampaignsSummary(since: Date) {
    const catalog = listCampaigns();
    const activeRows = await this.prisma.lifecycleActiveCampaign.groupBy({
      by: ['campaignId', 'campaignType'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    });
    const activeMap = new Map(
      activeRows.map((r) => [r.campaignId, r._count._all]),
    );

    const sentByCampaign = await this.prisma.lifecycleDelivery.groupBy({
      by: ['campaignId'],
      where: {
        createdAt: { gte: since },
        status: { in: SENT_STATUSES_LCM },
      },
      _count: { _all: true },
    });
    const sentMap = new Map(
      sentByCampaign.map((r) => [r.campaignId, r._count._all]),
    );

    const outcomes = await this.prisma.lifecycleOutcome.findMany({
      where: { recordedAt: { gte: since } },
      select: { campaignId: true, type: true, deliveryId: true },
    });

    const opensByCampaign = new Map<string, number>();
    const sentDeliveriesByCampaign = new Map<string, Set<string>>();

    const deliveryRows = await this.prisma.lifecycleDelivery.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: SENT_STATUSES_LCM },
      },
      select: { id: true, campaignId: true },
    });
    for (const d of deliveryRows) {
      if (!sentDeliveriesByCampaign.has(d.campaignId)) {
        sentDeliveriesByCampaign.set(d.campaignId, new Set());
      }
      sentDeliveriesByCampaign.get(d.campaignId)!.add(d.id);
    }

    for (const o of outcomes) {
      if (o.type === 'OPENED') {
        opensByCampaign.set(
          o.campaignId,
          (opensByCampaign.get(o.campaignId) ?? 0) + 1,
        );
      }
    }

    return catalog
      .map((campaign) => {
        const activeRestaurants = activeMap.get(campaign.id) ?? 0;
        const sentThisWeek = sentMap.get(campaign.id) ?? 0;
        const opens = opensByCampaign.get(campaign.id) ?? 0;
        const openRate = sentThisWeek > 0 ? opens / sentThisWeek : 0;

        let health: 'healthy' | 'attention' | 'idle' = 'idle';
        if (activeRestaurants > 0) {
          health =
            openRate >= 0.25 || sentThisWeek < 5 ? 'healthy' : 'attention';
        } else if (sentThisWeek > 0) {
          health = 'healthy';
        }

        return {
          campaignId: campaign.id,
          campaignType: campaign.type,
          goal: campaign.goal,
          activeRestaurants,
          sentThisWeek,
          openRate,
          health,
          enabled: true,
          primaryChannel: campaign.recommendedChannel,
        };
      })
      .sort((a, b) => b.activeRestaurants - a.activeRestaurants);
  }

  async listEmailsToday(since: Date) {
    const [lcm, ce] = await Promise.all([
      this.prisma.lifecycleDelivery.findMany({
        where: {
          channel: 'email',
          status: { in: SENT_STATUSES_LCM },
          OR: [
            { sentAt: { gte: since } },
            { sentAt: null, createdAt: { gte: since } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          restaurant: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.engagementDelivery.findMany({
        where: {
          channel: 'email',
          status: { in: SENT_STATUSES_CE },
          OR: [
            { sentAt: { gte: since } },
            { sentAt: null, createdAt: { gte: since } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          restaurant: { select: { name: true, slug: true } },
        },
      }),
    ]);

    const merged = [
      ...lcm.map((row) => ({
        id: row.id,
        source: 'lifecycle' as const,
        restaurantId: row.restaurantId,
        restaurantName: row.restaurant.name,
        restaurantSlug: row.restaurant.slug,
        campaignId: row.campaignId,
        campaignType: row.campaignType,
        subject: row.subject,
        bodyPreview: row.bodyPreview,
        status: row.status,
        sentAt: (row.sentAt ?? row.createdAt).toISOString(),
      })),
      ...ce.map((row) => ({
        id: row.id,
        source: 'engagement' as const,
        restaurantId: row.restaurantId,
        restaurantName: row.restaurant.name,
        restaurantSlug: row.restaurant.slug,
        campaignId: row.journeyId,
        campaignType: row.recommendationCode,
        subject: row.subject,
        bodyPreview: row.bodyPreview,
        status: row.status,
        sentAt: (row.sentAt ?? row.createdAt).toISOString(),
      })),
    ];

    return merged.sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );
  }

  async getCampaignPerformance(campaignId: string, days = 7) {
    const campaign = getCampaignById(campaignId);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const deliveries = await this.prisma.lifecycleDelivery.findMany({
      where: {
        campaignId,
        createdAt: { gte: since },
        status: { in: SENT_STATUSES_LCM },
      },
      select: {
        id: true,
        restaurantId: true,
        createdAt: true,
        sentAt: true,
        restaurant: { select: { name: true, slug: true } },
      },
    });

    const deliveryIds = deliveries.map((d) => d.id);
    const outcomes =
      deliveryIds.length > 0
        ? await this.prisma.lifecycleOutcome.findMany({
            where: { deliveryId: { in: deliveryIds } },
          })
        : [];

    const opened = outcomes.filter((o) => o.type === 'OPENED').length;
    const clicked = outcomes.filter((o) => o.type === 'CLICKED').length;
    const recovered = outcomes.filter(
      (o) =>
        o.type === 'GOAL_COMPLETED' ||
        o.type === 'JOURNEY_COMPLETED' ||
        (o.type === 'RSS_CONTRIBUTION' && o.rssDelta != null && o.rssDelta > 0),
    ).length;

    const sent = deliveries.length;
    const trend = this.buildDailyTrend(deliveries, days);

    const recentRecoveries = outcomes
      .filter(
        (o) =>
          o.type === 'GOAL_COMPLETED' ||
          o.type === 'JOURNEY_COMPLETED' ||
          (o.type === 'RSS_CONTRIBUTION' &&
            o.rssDelta != null &&
            o.rssDelta > 0),
      )
      .slice(0, 8)
      .map((o) => {
        const delivery = deliveries.find((d) => d.id === o.deliveryId);
        return {
          restaurantId: o.restaurantId,
          restaurantName: delivery?.restaurant.name ?? o.restaurantId,
          recoveredAt: o.recordedAt.toISOString(),
          rssDelta: o.rssDelta,
        };
      });

    return {
      campaignId,
      campaignType: campaign?.type ?? null,
      goal: campaign?.goal ?? null,
      periodDays: days,
      sent,
      opened,
      clicked,
      recovered,
      openRate: sent > 0 ? opened / sent : 0,
      clickRate: sent > 0 ? clicked / sent : 0,
      recoveryRate: sent > 0 ? recovered / sent : 0,
      trend,
      recentRecoveries,
      working:
        sent >= 3 ? recovered / sent >= 0.08 || opened / sent >= 0.2 : sent > 0,
    };
  }

  private async countRecoveredRestaurants(since: Date): Promise<number> {
    const rows = await this.prisma.lifecycleOutcome.findMany({
      where: {
        recordedAt: { gte: since },
        campaignType: { in: [...RECOVERY_CAMPAIGN_TYPES] },
        OR: [
          { type: 'GOAL_COMPLETED' },
          { type: 'JOURNEY_COMPLETED' },
          {
            type: 'RSS_CONTRIBUTION',
            rssDelta: { gt: 0 },
          },
        ],
      },
      select: { restaurantId: true },
    });
    return new Set(rows.map((r) => r.restaurantId)).size;
  }

  private async countEmailsBetween(from: Date, to: Date): Promise<number> {
    const [lcm, ce] = await Promise.all([
      this.prisma.lifecycleDelivery.count({
        where: {
          channel: 'email',
          status: { in: SENT_STATUSES_LCM },
          createdAt: { gte: from, lt: to },
        },
      }),
      this.prisma.engagementDelivery.count({
        where: {
          channel: 'email',
          status: { in: SENT_STATUSES_CE },
          createdAt: { gte: from, lt: to },
        },
      }),
    ]);
    return lcm + ce;
  }

  private buildDailyTrend(
    deliveries: Array<{ createdAt: Date; sentAt: Date | null }>,
    days: number,
  ): number[] {
    const trend: number[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = deliveries.filter((d) => {
        const t = d.sentAt ?? d.createdAt;
        return t >= dayStart && t < dayEnd;
      }).length;
      trend.push(count);
    }
    return trend;
  }

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
}
