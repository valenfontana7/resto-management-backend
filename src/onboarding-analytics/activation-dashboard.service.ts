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
import { computeGen2MetricsFromCohort } from './activation-gen2-metrics.utils';
import {
  buildOrderIncidentSummary,
  CRITICAL_INCIDENT_KIND_LABELS,
  type CriticalIncidentBreakdown,
  type CriticalIncidentRow,
  formatIncidentAmountCents,
  mergeRecentCriticalIncidents,
  resolveOrderIncidentKind,
  sumCriticalIncidentBreakdown,
} from './critical-incidents.utils';

const STEP_LABELS: Record<string, string> = {
  register_started: 'Registro iniciado',
  register_completed: 'Registro completado',
  preview_published: 'Web publicada',
  first_dashboard_visit: 'Primer ingreso al panel',
  go_live_completed: 'Go-live completado',
  trial_banner_viewed: 'Banner trial visto',
  trial_banner_cta_clicked: 'Intención de pago trial',
  trial_payment_prompt_viewed: 'Prompt post go-live visto',
  trial_payment_modal_opened: 'Modal de pago abierto',
  trial_payment_method_saved: 'Tarjeta guardada en trial',
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
      criticalIncidentsMetrics,
      trialPaymentIntent,
      gen2Cohort,
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
      this.getCriticalIncidentsMetrics(since),
      this.getTrialPaymentIntentRate(since),
      this.listGen2CohortRestaurants(since),
    ]);

    const gen2 = computeGen2MetricsFromCohort(gen2Cohort);

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
        medianTtfvMinutes: gen2.medianTtfvMinutes,
        ttfvP75Minutes: gen2.ttfvP75Minutes,
        ttfvSampleSize: gen2.ttfvSampleSize,
        acr24hPercent: gen2.acr24hPercent,
        acr7dPercent: gen2.acr7dPercent,
        wowMomentRatePercent: gen2.wowMomentRatePercent,
        secondSessionRatePercent: gen2.secondSessionRatePercent,
        activationScoreDistribution: gen2.scoreDistribution,
        onlinePaymentActiveWeek1Percent: onlinePaymentWeek1.rate,
        onlinePaymentActiveWeek1Sample: onlinePaymentWeek1.sampleSize,
        averageD30Rate: retention.averageD30Rate,
        sampleUsersD30: retention.sampleUsersD30,
        criticalIncidents: criticalIncidentsMetrics.total,
        trialPaymentMethodRate: trialPaymentIntent.rate,
        trialPaymentMethodSample: trialPaymentIntent.sampleSize,
      },
      criticalIncidentsBreakdown: criticalIncidentsMetrics.breakdown,
      recentCriticalIncidents: criticalIncidentsMetrics.recent,
      conversion: {
        registeredToPublished,
        publishedToCharge,
        landingToRegister:
          funnel.highlights?.landingToRegisterConversion ?? null,
        registerToPublish:
          funnel.highlights?.registerToPublishConversion ?? null,
        registerToFirstResult:
          funnel.highlights?.registerToFirstResultConversion ?? null,
        demoOpenedToTestOrder:
          funnel.highlights?.demoOpenedToTestOrderConversion ?? null,
        trialToPaymentSaved:
          funnel.highlights?.trialIntentToPaymentSavedConversion ?? null,
        goLiveToPaymentSaved:
          funnel.highlights?.goLiveToPaymentSavedConversion ?? null,
      },
      discoveryFunnel: funnel.discoverySteps ?? [],
      topFrictions,
      stuckRestaurants,
      gen2,
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

  private async listGen2CohortRestaurants(since: Date) {
    return this.prisma.restaurant.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        createdAt: true,
        businessRules: true,
      },
    });
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
        WHERE mp."restaurantId" IS NOT NULL OR o.id IS NOT NULL
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

  private async getTrialPaymentIntentRate(since: Date): Promise<{
    rate: number | null;
    sampleSize: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ total: bigint; with_payment: bigint }>
    >`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM "SubscriptionPaymentMethod" pm
            WHERE pm."subscriptionId" = s.id
          )
          OR s."paymentMethodId" IS NOT NULL
        )::bigint AS with_payment
      FROM "Subscription" s
      INNER JOIN "Restaurant" r ON r.id = s."restaurantId"
      WHERE r."createdAt" >= ${since}
        AND s.status = 'TRIALING'
    `;

    const total = Number(rows[0]?.total ?? 0);
    const withPayment = Number(rows[0]?.with_payment ?? 0);
    return {
      rate: total > 0 ? Math.round((withPayment / total) * 1000) / 10 : null,
      sampleSize: total,
    };
  }

  private async getCriticalIncidentsMetrics(since: Date): Promise<{
    total: number;
    breakdown: CriticalIncidentBreakdown;
    recent: CriticalIncidentRow[];
  }> {
    const [
      paymentFailed,
      paymentRefunded,
      orderCancelledPaid,
      fiscalRejected,
      checkoutFailed,
      menuAutoDisabled,
      recent,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          paymentStatus: 'FAILED',
        },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          paymentStatus: 'REFUNDED',
        },
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: since },
          status: 'CANCELLED',
          paymentStatus: 'PAID',
        },
      }),
      this.prisma.fiscalDocument.count({
        where: {
          updatedAt: { gte: since },
          status: 'REJECTED',
        },
      }),
      this.prisma.checkoutSession.count({
        where: {
          updatedAt: { gte: since },
          paymentStatus: 'FAILED',
        },
      }),
      this.prisma.dish.count({
        where: {
          updatedAt: { gte: since },
          autoDisabledByStock: true,
          deletedAt: null,
        },
      }),
      this.listRecentCriticalIncidents(since, 12),
    ]);

    const breakdown: CriticalIncidentBreakdown = {
      paymentFailed,
      paymentRefunded,
      orderCancelledPaid,
      fiscalRejected,
      checkoutFailed,
      menuAutoDisabled,
    };

    return {
      total: sumCriticalIncidentBreakdown(breakdown),
      breakdown,
      recent,
    };
  }

  private async listRecentCriticalIncidents(
    since: Date,
    limit: number,
  ): Promise<CriticalIncidentRow[]> {
    const perSource = Math.max(4, Math.ceil(limit / 3));

    const [orders, fiscalDocuments, checkoutSessions, dishes] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            createdAt: { gte: since },
            OR: [
              { paymentStatus: 'FAILED' },
              { paymentStatus: 'REFUNDED' },
              { status: 'CANCELLED', paymentStatus: 'PAID' },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: perSource,
          select: {
            id: true,
            orderNumber: true,
            paymentStatus: true,
            status: true,
            total: true,
            createdAt: true,
            restaurantId: true,
            restaurant: { select: { name: true, slug: true } },
          },
        }),
        this.prisma.fiscalDocument.findMany({
          where: {
            updatedAt: { gte: since },
            status: 'REJECTED',
          },
          orderBy: { updatedAt: 'desc' },
          take: perSource,
          select: {
            id: true,
            type: true,
            total: true,
            updatedAt: true,
            restaurantId: true,
            restaurant: { select: { name: true, slug: true } },
          },
        }),
        this.prisma.checkoutSession.findMany({
          where: {
            updatedAt: { gte: since },
            paymentStatus: 'FAILED',
          },
          orderBy: { updatedAt: 'desc' },
          take: perSource,
          select: {
            id: true,
            orderNumber: true,
            total: true,
            updatedAt: true,
            restaurantId: true,
            restaurant: { select: { name: true, slug: true } },
          },
        }),
        this.prisma.dish.findMany({
          where: {
            updatedAt: { gte: since },
            autoDisabledByStock: true,
            deletedAt: null,
          },
          orderBy: { updatedAt: 'desc' },
          take: perSource,
          select: {
            id: true,
            name: true,
            updatedAt: true,
            restaurantId: true,
            restaurant: { select: { name: true, slug: true } },
          },
        }),
      ]);

    const rows: CriticalIncidentRow[] = [
      ...orders.map((order) => {
        const kind = resolveOrderIncidentKind(order);
        return {
          id: `order-${order.id}`,
          kind,
          label: CRITICAL_INCIDENT_KIND_LABELS[kind],
          summary: buildOrderIncidentSummary(order),
          occurredAt: order.createdAt.toISOString(),
          restaurantId: order.restaurantId,
          restaurantName: order.restaurant.name,
          restaurantSlug: order.restaurant.slug,
        };
      }),
      ...fiscalDocuments.map((doc) => ({
        id: `fiscal-${doc.id}`,
        kind: 'fiscal_rejected' as const,
        label: CRITICAL_INCIDENT_KIND_LABELS.fiscal_rejected,
        summary: `${doc.type.replaceAll('_', ' ')} · ${formatIncidentAmountCents(doc.total)}`,
        occurredAt: doc.updatedAt.toISOString(),
        restaurantId: doc.restaurantId,
        restaurantName: doc.restaurant.name,
        restaurantSlug: doc.restaurant.slug,
      })),
      ...checkoutSessions.map((session) => ({
        id: `checkout-${session.id}`,
        kind: 'checkout_failed' as const,
        label: CRITICAL_INCIDENT_KIND_LABELS.checkout_failed,
        summary: `Checkout ${session.orderNumber} · ${formatIncidentAmountCents(session.total)}`,
        occurredAt: session.updatedAt.toISOString(),
        restaurantId: session.restaurantId,
        restaurantName: session.restaurant.name,
        restaurantSlug: session.restaurant.slug,
      })),
      ...dishes.map((dish) => ({
        id: `dish-${dish.id}`,
        kind: 'menu_auto_disabled' as const,
        label: CRITICAL_INCIDENT_KIND_LABELS.menu_auto_disabled,
        summary: dish.name,
        occurredAt: dish.updatedAt.toISOString(),
        restaurantId: dish.restaurantId,
        restaurantName: dish.restaurant.name,
        restaurantSlug: dish.restaurant.slug,
      })),
    ];

    return mergeRecentCriticalIncidents(rows, limit);
  }
}
