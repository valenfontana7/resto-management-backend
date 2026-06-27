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
      ttvMetrics,
      onlinePaymentWeek1,
      retention,
      criticalIncidents,
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
      this.getTtvMetrics(since),
      this.getOnlinePaymentActiveWeek1Rate(since),
      this.onboardingAnalytics.getRetentionCohorts(Math.min(safeDays, 60)),
      this.countCriticalIncidents(since),
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
        medianTtvHours: ttvMetrics.medianHours,
        ttvSampleSize: ttvMetrics.sampleSize,
        onlinePaymentActiveWeek1Percent: onlinePaymentWeek1.rate,
        onlinePaymentActiveWeek1Sample: onlinePaymentWeek1.sampleSize,
        averageD30Rate: retention.averageD30Rate,
        sampleUsersD30: retention.sampleUsersD30,
        criticalIncidents: criticalIncidents.value,
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

  private async getTtvMetrics(since: Date): Promise<{
    medianHours: number | null;
    sampleSize: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ hours_to_first_charge: number | null }>
    >`
      WITH first_paid AS (
        SELECT
          r.id,
          EXTRACT(EPOCH FROM (MIN(o."paidAt") - r."createdAt")) / 3600.0 AS hours_to_first_charge
        FROM "Restaurant" r
        INNER JOIN "Order" o ON o."restaurantId" = r.id
        WHERE r."createdAt" >= ${since}
          AND o."paymentStatus" = 'PAID'
          AND o."paidAt" IS NOT NULL
        GROUP BY r.id, r."createdAt"
      )
      SELECT hours_to_first_charge
      FROM first_paid
      WHERE hours_to_first_charge IS NOT NULL AND hours_to_first_charge >= 0
      ORDER BY hours_to_first_charge
    `;

    const values = rows
      .map((row) => row.hours_to_first_charge)
      .filter((value): value is number => value != null);
    if (values.length === 0) {
      return { medianHours: null, sampleSize: 0 };
    }

    const mid = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];

    return {
      medianHours: Math.round(median * 10) / 10,
      sampleSize: values.length,
    };
  }

  private async getOnlinePaymentActiveWeek1Rate(since: Date): Promise<{
    rate: number | null;
    sampleSize: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ total: bigint; active: bigint }>
    >`
      WITH cohort AS (
        SELECT id, "createdAt"
        FROM "Restaurant"
        WHERE "createdAt" >= ${since}
      ),
      active AS (
        SELECT DISTINCT c.id
        FROM cohort c
        LEFT JOIN "MercadoPagoCredential" mp ON mp."restaurantId" = c.id
        LEFT JOIN "Order" o ON o."restaurantId" = c.id
          AND o."paymentStatus" = 'PAID'
          AND o."paidAt" IS NOT NULL
          AND o."paidAt" <= c."createdAt" + INTERVAL '7 day'
          AND o."paymentMethod" IN ('mercadopago', 'card', 'credit-card', 'debit-card')
        WHERE mp.id IS NOT NULL OR o.id IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*)::bigint FROM cohort) AS total,
        (SELECT COUNT(*)::bigint FROM active) AS active
    `;

    const total = Number(rows[0]?.total ?? 0);
    const active = Number(rows[0]?.active ?? 0);
    return {
      rate: total > 0 ? Math.round((active / total) * 1000) / 10 : null,
      sampleSize: total,
    };
  }

  private async countCriticalIncidents(
    since: Date,
  ): Promise<{ value: number }> {
    const [failedPayments, cancelledOrders] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          paymentStatus: { in: ['FAILED', 'REFUNDED'] },
        },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          status: 'CANCELLED',
          paymentStatus: 'PAID',
        },
      }),
    ]);

    return { value: failedPayments + cancelledOrders };
  }
}
