import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OnboardingAnalyticsService,
  FUNNEL_STEPS,
} from './onboarding-analytics.service';
import {
  buildTopFrictions,
  computePeriodDelta,
} from './activation-dashboard.utils';

const STEP_LABELS: Record<string, string> = {
  register_started: 'Registro iniciado',
  register_completed: 'Registro completado',
  preview_published: 'Web publicada',
  first_dashboard_visit: 'Primer ingreso al panel',
  go_live_completed: 'Go-live completado',
  trial_banner_viewed: 'Banner trial visto',
  trial_banner_cta_clicked: 'Intención de pago trial',
};

@Injectable()
export class ActivationDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingAnalytics: OnboardingAnalyticsService,
  ) {}

  async getDashboard(days = 7) {
    const safeDays =
      Number.isFinite(days) && days > 0 && days <= 90 ? Math.floor(days) : 7;

    const since = new Date();
    since.setDate(since.getDate() - safeDays);
    const previousSince = new Date(since);
    previousSince.setDate(previousSince.getDate() - safeDays);

    const [
      registered,
      registeredPrevious,
      published,
      publishedPrevious,
      firstCharge,
      firstChargePrevious,
      teamActivated,
      teamActivatedPrevious,
      funnel,
      stuckCounts,
      stuckRestaurants,
    ] = await Promise.all([
      this.countRestaurantsRegistered(since),
      this.countRestaurantsRegistered(previousSince, since),
      this.countPublished(since),
      this.countPublished(previousSince, since),
      this.countFirstCharge(since),
      this.countFirstCharge(previousSince, since),
      this.countTeamActivated(since),
      this.countTeamActivated(previousSince, since),
      this.onboardingAnalytics.getFunnel(safeDays),
      this.getStuckCounts(),
      this.listStuckRestaurants(8),
    ]);

    const funnelDrops = funnel.steps
      .map((step, idx) => {
        if (idx === 0 || step.conversionFromPrev == null) return null;
        const previous = funnel.steps[idx - 1].uniqueSessions;
        return {
          event: step.event,
          label: STEP_LABELS[step.event] ?? step.event,
          dropPercent: Math.max(0, 100 - step.conversionFromPrev),
          lostSessions: Math.max(0, previous - step.uniqueSessions),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.dropPercent - a.dropPercent)
      .slice(0, 5);

    const topFrictions = buildTopFrictions({
      funnelDrops,
      unpublishedAfter3Days: stuckCounts.unpublishedAfter3Days,
      noMenuAfter7Days: stuckCounts.noMenuAfter7Days,
      noFirstChargeAfter14Days: stuckCounts.noFirstChargeAfter14Days,
      limit: 3,
    });

    const registeredToPublished =
      registered > 0 ? Math.round((published / registered) * 1000) / 10 : null;
    const publishedToCharge =
      published > 0 ? Math.round((firstCharge / published) * 1000) / 10 : null;

    return {
      periodDays: safeDays,
      since: since.toISOString(),
      kpis: {
        registered: {
          value: registered,
          deltaPercent: computePeriodDelta(registered, registeredPrevious),
        },
        published: {
          value: published,
          deltaPercent: computePeriodDelta(published, publishedPrevious),
        },
        firstCharge: {
          value: firstCharge,
          deltaPercent: computePeriodDelta(firstCharge, firstChargePrevious),
        },
        teamActivated: {
          value: teamActivated,
          deltaPercent: computePeriodDelta(
            teamActivated,
            teamActivatedPrevious,
          ),
        },
      },
      conversion: {
        registeredToPublished,
        publishedToCharge,
        landingToRegister:
          funnel.highlights?.landingToRegisterConversion ?? null,
        registerToPublish:
          funnel.highlights?.registerToPublishConversion ?? null,
      },
      topFrictions,
      stuckRestaurants,
      funnelHighlights: {
        overallConversion: funnel.overallConversion,
        biggestDrop: funnelDrops[0] ?? null,
        keySteps: FUNNEL_STEPS.filter((event) =>
          [
            'register_started',
            'preview_published',
            'first_dashboard_visit',
            'go_live_completed',
          ].includes(event),
        ).map((event) => {
          const step = funnel.steps.find((row) => row.event === event);
          return {
            event,
            label: STEP_LABELS[event] ?? event,
            uniqueSessions: step?.uniqueSessions ?? 0,
          };
        }),
      },
    };
  }

  private countRestaurantsRegistered(since: Date, until?: Date) {
    return this.prisma.restaurant.count({
      where: {
        createdAt: until ? { gte: since, lt: until } : { gte: since },
      },
    });
  }

  private async countPublished(since: Date, until?: Date) {
    const eventCount = until
      ? Number(
          (
            await this.prisma.$queryRaw<Array<{ count: bigint }>>`
              SELECT COUNT(DISTINCT "restaurantId")::bigint AS count
              FROM "OnboardingEvent"
              WHERE "restaurantId" IS NOT NULL
                AND "event" IN ('preview_published', 'go_live_completed')
                AND "createdAt" >= ${since}
                AND "createdAt" < ${until}
            `
          )[0]?.count ?? 0,
        )
      : Number(
          (
            await this.prisma.$queryRaw<Array<{ count: bigint }>>`
              SELECT COUNT(DISTINCT "restaurantId")::bigint AS count
              FROM "OnboardingEvent"
              WHERE "restaurantId" IS NOT NULL
                AND "event" IN ('preview_published', 'go_live_completed')
                AND "createdAt" >= ${since}
            `
          )[0]?.count ?? 0,
        );

    const restaurantCount = await this.prisma.restaurant.count({
      where: {
        isPublished: true,
        updatedAt: until ? { gte: since, lt: until } : { gte: since },
      },
    });

    return Math.max(eventCount, restaurantCount);
  }

  private async countFirstCharge(since: Date, until?: Date) {
    const rows = until
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          WITH first_charge AS (
            SELECT "restaurantId", MIN("createdAt") AS first_at
            FROM "Order"
            WHERE status IN (${OrderStatus.DELIVERED}, ${OrderStatus.PAID})
            GROUP BY "restaurantId"
          )
          SELECT COUNT(*)::bigint AS count
          FROM first_charge
          WHERE first_at >= ${since}
            AND first_at < ${until}
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          WITH first_charge AS (
            SELECT "restaurantId", MIN("createdAt") AS first_at
            FROM "Order"
            WHERE status IN (${OrderStatus.DELIVERED}, ${OrderStatus.PAID})
            GROUP BY "restaurantId"
          )
          SELECT COUNT(*)::bigint AS count
          FROM first_charge
          WHERE first_at >= ${since}
        `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countTeamActivated(since: Date, until?: Date) {
    const rows = until
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM (
            SELECT r.id
            FROM "Restaurant" r
            INNER JOIN "RestaurantMembership" m ON m."restaurantId" = r.id
            INNER JOIN "User" u ON u.id = m."userId" AND u."isActive" = true
            WHERE r."createdAt" >= ${since}
              AND r."createdAt" < ${until}
            GROUP BY r.id
            HAVING COUNT(DISTINCT m."userId") >= 3
          ) teams
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM (
            SELECT r.id
            FROM "Restaurant" r
            INNER JOIN "RestaurantMembership" m ON m."restaurantId" = r.id
            INNER JOIN "User" u ON u.id = m."userId" AND u."isActive" = true
            WHERE r."createdAt" >= ${since}
            GROUP BY r.id
            HAVING COUNT(DISTINCT m."userId") >= 3
          ) teams
        `;

    return Number(rows[0]?.count ?? 0);
  }

  private async getStuckCounts() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        unpublished_after_3d: bigint;
        no_menu_after_7d: bigint;
        no_first_charge_after_14d: bigint;
      }>
    >`
      WITH restaurant_stats AS (
        SELECT
          r.id,
          r."createdAt",
          r."isPublished",
          COALESCE(d.dish_count, 0)::int AS dish_count,
          fc.first_charge_at
        FROM "Restaurant" r
        LEFT JOIN (
          SELECT "restaurantId", COUNT(*)::int AS dish_count
          FROM "Dish"
          WHERE "deletedAt" IS NULL
          GROUP BY "restaurantId"
        ) d ON d."restaurantId" = r.id
        LEFT JOIN (
          SELECT "restaurantId", MIN("createdAt") AS first_charge_at
          FROM "Order"
          WHERE status IN ('DELIVERED', 'PAID')
          GROUP BY "restaurantId"
        ) fc ON fc."restaurantId" = r.id
      )
      SELECT
        COUNT(*) FILTER (
          WHERE NOT "isPublished"
            AND "createdAt" < NOW() - INTERVAL '3 day'
        )::bigint AS unpublished_after_3d,
        COUNT(*) FILTER (
          WHERE dish_count = 0
            AND "createdAt" < NOW() - INTERVAL '7 day'
        )::bigint AS no_menu_after_7d,
        COUNT(*) FILTER (
          WHERE "isPublished"
            AND first_charge_at IS NULL
            AND "createdAt" < NOW() - INTERVAL '14 day'
        )::bigint AS no_first_charge_after_14d
      FROM restaurant_stats
    `;

    const row = rows[0];
    return {
      unpublishedAfter3Days: Number(row?.unpublished_after_3d ?? 0),
      noMenuAfter7Days: Number(row?.no_menu_after_7d ?? 0),
      noFirstChargeAfter14Days: Number(row?.no_first_charge_after_14d ?? 0),
    };
  }

  private async listStuckRestaurants(limit: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        created_at: Date;
        is_published: boolean;
        onboarding_incomplete: boolean;
        dish_count: number;
        team_size: number;
        first_charge_at: Date | null;
        issue: string;
      }>
    >`
      SELECT
        r.id,
        r.name,
        r.slug,
        r."createdAt" AS created_at,
        r."isPublished" AS is_published,
        r."onboardingIncomplete" AS onboarding_incomplete,
        COALESCE(d.dish_count, 0)::int AS dish_count,
        COALESCE(t.team_size, 0)::int AS team_size,
        fc.first_charge_at,
        CASE
          WHEN NOT r."isPublished" AND r."createdAt" < NOW() - INTERVAL '3 day'
            THEN 'Sin publicar'
          WHEN COALESCE(d.dish_count, 0) = 0 AND r."createdAt" < NOW() - INTERVAL '7 day'
            THEN 'Sin menú'
          WHEN r."isPublished" AND fc.first_charge_at IS NULL AND r."createdAt" < NOW() - INTERVAL '14 day'
            THEN 'Sin cobro'
          WHEN COALESCE(t.team_size, 0) < 3 AND r."createdAt" < NOW() - INTERVAL '14 day'
            THEN 'Equipo chico'
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
      WHERE r."createdAt" >= NOW() - INTERVAL '90 day'
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
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at.toISOString(),
      isPublished: row.is_published,
      onboardingIncomplete: row.onboarding_incomplete,
      dishCount: row.dish_count,
      teamSize: row.team_size,
      firstChargeAt: row.first_charge_at?.toISOString() ?? null,
      issue: row.issue,
    }));
  }
}
