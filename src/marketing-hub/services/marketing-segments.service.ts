import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { WINBACK_CAMPAIGN_ID } from '../../lifecycle-marketing/services/marketing-director.service';

type RssBand =
  | 'champion'
  | 'healthy'
  | 'attention'
  | 'at_risk'
  | 'critical'
  | 'unknown';

export type MarketingCareReason =
  | 'at_risk'
  | 'activation_stuck'
  | 'winback_active';

export interface MarketingCareAccount {
  restaurantId: string;
  name: string;
  slug: string;
  reason: MarketingCareReason;
  detail: string;
  rssBand: string | null;
  href: string;
}

@Injectable()
export class MarketingSegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRestaurantSegments() {
    const [activeRestaurants, trialingCount, cacheRows] = await Promise.all([
      this.prisma.restaurant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({
        where: {
          isBillingAnchor: true,
          status: SubscriptionStatus.TRIALING,
        },
      }),
      this.prisma.restaurantIntelligenceSnapshotCache.findMany({
        select: { bundle: true },
      }),
    ]);

    const byBand: Record<RssBand, number> = {
      champion: 0,
      healthy: 0,
      attention: 0,
      at_risk: 0,
      critical: 0,
      unknown: 0,
    };

    for (const row of cacheRows) {
      const bundle = row.bundle as {
        snapshot?: { rss?: { band?: string } };
      };
      const band = (bundle?.snapshot?.rss?.band ?? 'unknown') as RssBand;
      if (band in byBand) byBand[band]++;
      else byBand.unknown++;
    }

    const restaurantsWithCache = cacheRows.length;
    const uncached = Math.max(0, activeRestaurants - restaurantsWithCache);

    return {
      activeRestaurants,
      onboardingRestaurants: trialingCount + byBand.attention,
      atRiskRestaurants: byBand.at_risk + byBand.critical,
      championRestaurants: byBand.champion,
      healthyRestaurants: byBand.healthy,
      uncachedRestaurants: uncached,
      byRssBand: byBand,
      dataNote:
        uncached > 0
          ? `${uncached} restaurantes activos sin datos de salud cacheados — correr evaluación masiva para segmentar completo.`
          : null,
    };
  }

  /**
   * Cola operativa: riesgo RSS + activación atascada + winback activo.
   * Deduplica por restaurantId priorizando riesgo > winback > stuck.
   */
  async getCareQueue(limit = 12): Promise<{
    items: MarketingCareAccount[];
    counts: {
      atRisk: number;
      activationStuck: number;
      winbackActive: number;
      total: number;
    };
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const [atRisk, stuck, winback] = await Promise.all([
      this.listAtRiskAccounts(safeLimit),
      this.listActivationStuck(safeLimit),
      this.listWinbackActive(safeLimit),
    ]);

    const byId = new Map<string, MarketingCareAccount>();
    const priority: Record<MarketingCareReason, number> = {
      at_risk: 3,
      winback_active: 2,
      activation_stuck: 1,
    };

    for (const item of [...atRisk, ...winback, ...stuck]) {
      const existing = byId.get(item.restaurantId);
      if (!existing || priority[item.reason] > priority[existing.reason]) {
        byId.set(item.restaurantId, item);
      }
    }

    const items = Array.from(byId.values())
      .sort(
        (a, b) =>
          priority[b.reason] - priority[a.reason] ||
          a.name.localeCompare(b.name),
      )
      .slice(0, safeLimit);

    return {
      items,
      counts: {
        atRisk: atRisk.length,
        activationStuck: stuck.length,
        winbackActive: winback.length,
        total: items.length,
      },
    };
  }

  private async listAtRiskAccounts(
    limit: number,
  ): Promise<MarketingCareAccount[]> {
    const rows = await this.prisma.restaurantIntelligenceSnapshotCache.findMany(
      {
        select: {
          restaurantId: true,
          bundle: true,
          restaurant: { select: { name: true, slug: true, status: true } },
        },
      },
    );

    const items: MarketingCareAccount[] = [];
    for (const row of rows) {
      if (row.restaurant.status !== 'ACTIVE') continue;
      const bundle = row.bundle as {
        snapshot?: { rss?: { band?: string; score?: number } };
        recommendations?: Array<{ code?: string }>;
      };
      const band = bundle?.snapshot?.rss?.band ?? null;
      if (band !== 'at_risk' && band !== 'critical') continue;

      const topRec = bundle?.recommendations?.[0]?.code;
      items.push({
        restaurantId: row.restaurantId,
        name: row.restaurant.name,
        slug: row.restaurant.slug,
        reason: 'at_risk',
        detail: topRec
          ? `Salud ${band === 'critical' ? 'crítica' : 'en riesgo'} · ${topRec}`
          : `Salud ${band === 'critical' ? 'crítica' : 'en riesgo'} — revisar`,
        rssBand: band,
        href: `/master/marketing/restaurant?slug=${encodeURIComponent(row.restaurant.slug)}`,
      });
    }

    return items
      .sort((a, b) => {
        if (a.rssBand === 'critical' && b.rssBand !== 'critical') return -1;
        if (b.rssBand === 'critical' && a.rssBand !== 'critical') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }

  private async listActivationStuck(
    limit: number,
  ): Promise<MarketingCareAccount[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        issue: string;
      }>
    >`
      SELECT
        r.id,
        r.name,
        r.slug,
        CASE
          WHEN NOT r."isPublished" AND r."createdAt" < NOW() - INTERVAL '3 day'
            THEN 'Sin publicar (+3d)'
          WHEN COALESCE(d.dish_count, 0) = 0 AND r."createdAt" < NOW() - INTERVAL '7 day'
            THEN 'Sin menú (+7d)'
          WHEN r."isPublished" AND fc.first_charge_at IS NULL AND r."createdAt" < NOW() - INTERVAL '14 day'
            THEN 'Sin primer cobro (+14d)'
          WHEN COALESCE(t.team_size, 0) < 3 AND r."createdAt" < NOW() - INTERVAL '14 day'
            THEN 'Equipo incompleto'
          ELSE 'Onboarding incompleto'
        END AS issue
      FROM "Restaurant" r
      LEFT JOIN (
        SELECT "restaurantId", COUNT(*)::int AS dish_count
        FROM "Dish"
        WHERE "deletedAt" IS NULL
        GROUP BY "restaurantId"
      ) d ON d."restaurantId" = r.id
      LEFT JOIN (
        SELECT m."restaurantId", COUNT(DISTINCT m."userId")::int AS team_size
        FROM "RestaurantMembership" m
        INNER JOIN "User" u ON u.id = m."userId" AND u."isActive" = true
        GROUP BY m."restaurantId"
      ) t ON t."restaurantId" = r.id
      LEFT JOIN (
        SELECT "restaurantId", MIN("createdAt") AS first_charge_at
        FROM "Order"
        WHERE status IN ('DELIVERED', 'PAID')
        GROUP BY "restaurantId"
      ) fc ON fc."restaurantId" = r.id
      WHERE r.status = 'ACTIVE'
        AND r."createdAt" >= NOW() - INTERVAL '90 day'
        AND (
          (NOT r."isPublished" AND r."createdAt" < NOW() - INTERVAL '3 day')
          OR (COALESCE(d.dish_count, 0) = 0 AND r."createdAt" < NOW() - INTERVAL '7 day')
          OR (r."isPublished" AND fc.first_charge_at IS NULL AND r."createdAt" < NOW() - INTERVAL '14 day')
          OR (COALESCE(t.team_size, 0) < 3 AND r."createdAt" < NOW() - INTERVAL '14 day')
          OR r."onboardingIncomplete" = true
        )
      ORDER BY r."createdAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      restaurantId: row.id,
      name: row.name,
      slug: row.slug,
      reason: 'activation_stuck' as const,
      detail: row.issue,
      rssBand: null,
      href: `/master/marketing/restaurant?slug=${encodeURIComponent(row.slug)}`,
    }));
  }

  private async listWinbackActive(
    limit: number,
  ): Promise<MarketingCareAccount[]> {
    const rows = await this.prisma.lifecycleActiveCampaign.findMany({
      where: {
        campaignId: WINBACK_CAMPAIGN_ID,
        status: 'ACTIVE',
      },
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        restaurant: { select: { name: true, slug: true } },
      },
    });

    return rows.map((row) => ({
      restaurantId: row.restaurantId,
      name: row.restaurant.name,
      slug: row.restaurant.slug,
      reason: 'winback_active' as const,
      detail: row.sourceRecommendationCode
        ? `Recuperación activa · ${row.sourceRecommendationCode}`
        : 'Recuperación activa',
      rssBand: null,
      href: `/master/marketing/restaurant?slug=${encodeURIComponent(row.restaurant.slug)}`,
    }));
  }
}
