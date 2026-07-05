import { Injectable } from '@nestjs/common';
import {
  EngagementDeliveryStatus,
  LifecycleDeliveryStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface MarketingDeliveriesQuery {
  days?: number;
  from?: string;
  to?: string;
  source?: 'all' | 'lifecycle' | 'engagement';
  status?: string;
  channel?: string;
  campaignId?: string;
  templateId?: string;
  restaurantId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class MarketingDeliveriesQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listDeliveries(query: MarketingDeliveriesQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const { from, to } = this.resolveRange(query);
    const source = query.source ?? 'all';

    const [lcm, ce] = await Promise.all([
      source === 'engagement' ? [] : this.fetchLifecycle(from, to, query),
      source === 'lifecycle' ? [] : this.fetchEngagement(from, to, query),
    ]);

    const merged = [...lcm, ...ce].sort(
      (a, b) =>
        new Date(b.sentAt ?? b.createdAt).getTime() -
        new Date(a.sentAt ?? a.createdAt).getTime(),
    );

    const page = merged.slice(offset, offset + limit);

    const deliveryIds = page.map((d) => d.id);
    const outcomes =
      deliveryIds.length > 0
        ? await this.loadOutcomes(
            page.map((d) => ({ id: d.id, source: d.source })),
          )
        : new Map<string, Set<string>>();

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      total: merged.length,
      limit,
      offset,
      items: page.map((row) => ({
        ...row,
        outcomes: Array.from(outcomes.get(row.id) ?? []),
        opened: outcomes.get(row.id)?.has('OPENED') ?? false,
        clicked: outcomes.get(row.id)?.has('CLICKED') ?? false,
        replied: outcomes.get(row.id)?.has('REPLIED') ?? false,
        goalCompleted:
          outcomes.get(row.id)?.has('GOAL_COMPLETED') ||
          outcomes.get(row.id)?.has('JOURNEY_COMPLETED') ||
          false,
      })),
    };
  }

  private resolveRange(query: MarketingDeliveriesQuery) {
    if (query.from && query.to) {
      return { from: new Date(query.from), to: new Date(query.to) };
    }
    const days =
      query.days && query.days > 0 && query.days <= 90 ? query.days : 7;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  private async fetchLifecycle(
    from: Date,
    to: Date,
    query: MarketingDeliveriesQuery,
  ) {
    const rows = await this.prisma.lifecycleDelivery.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.templateId ? { templateId: query.templateId } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.status
          ? { status: query.status as LifecycleDeliveryStatus }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      source: 'lifecycle' as const,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurant.name,
      restaurantSlug: row.restaurant.slug,
      campaignId: row.campaignId,
      campaignType: row.campaignType,
      templateId: row.templateId,
      channel: row.channel,
      status: row.status,
      subject: row.subject,
      bodyPreview: row.bodyPreview,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      deliverAt: row.deliverAt.toISOString(),
    }));
  }

  private async fetchEngagement(
    from: Date,
    to: Date,
    query: MarketingDeliveriesQuery,
  ) {
    const rows = await this.prisma.engagementDelivery.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
        ...(query.templateId ? { templateId: query.templateId } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.status
          ? { status: query.status as EngagementDeliveryStatus }
          : {}),
        ...(query.campaignId
          ? {
              OR: [
                { journeyId: query.campaignId },
                { recommendationCode: query.campaignId },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        restaurant: { select: { id: true, name: true, slug: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      source: 'engagement' as const,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurant.name,
      restaurantSlug: row.restaurant.slug,
      campaignId: row.journeyId,
      campaignType: row.recommendationCode,
      templateId: row.templateId,
      channel: row.channel,
      status: row.status,
      subject: row.subject,
      bodyPreview: row.bodyPreview,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      deliverAt: row.deliverAt.toISOString(),
    }));
  }

  private async loadOutcomes(
    deliveries: Array<{ id: string; source: 'lifecycle' | 'engagement' }>,
  ) {
    const map = new Map<string, Set<string>>();
    const lcmIds = deliveries
      .filter((d) => d.source === 'lifecycle')
      .map((d) => d.id);
    const ceIds = deliveries
      .filter((d) => d.source === 'engagement')
      .map((d) => d.id);

    const [lcmOutcomes, ceOutcomes] = await Promise.all([
      lcmIds.length
        ? this.prisma.lifecycleOutcome.findMany({
            where: { deliveryId: { in: lcmIds } },
            select: { deliveryId: true, type: true },
          })
        : [],
      ceIds.length
        ? this.prisma.engagementOutcome.findMany({
            where: { deliveryId: { in: ceIds } },
            select: { deliveryId: true, type: true },
          })
        : [],
    ]);

    for (const o of [...lcmOutcomes, ...ceOutcomes]) {
      if (!map.has(o.deliveryId)) map.set(o.deliveryId, new Set());
      map.get(o.deliveryId)!.add(o.type);
    }
    return map;
  }
}
