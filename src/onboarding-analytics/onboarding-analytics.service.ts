import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackOnboardingEventDto } from './dto/track-event.dto';

export const FUNNEL_STEPS = [
  'landing_viewed',
  'landing_cta_clicked',
  'landing_demo_clicked',
  'landing_whatsapp_clicked',
  'register_started',
  'register_completed',
  'magic_link_consumed',
  'spark_viewed',
  'spark_submitted',
  'ai_draft_generated',
  'preview_viewed',
  'preview_published',
  'celebrate_viewed',
  'whatsapp_shared',
  'first_dashboard_visit',
  'trial_banner_viewed',
  'trial_banner_cta_clicked',
  'trial_help_whatsapp_clicked',
  'trial_payment_prompt_viewed',
  'trial_payment_prompt_dismissed',
  'trial_payment_modal_opened',
  'trial_payment_method_saved',
  'customer_whatsapp_notified',
  'go_live_completed',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

@Injectable()
export class OnboardingAnalyticsService {
  private readonly logger = new Logger(OnboardingAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(events: TrackOnboardingEventDto[]) {
    if (!events.length) return { count: 0 };
    try {
      const data = events.map((e) => ({
        sessionId: e.sessionId,
        event: e.event.slice(0, 64),
        userId: e.userId || null,
        restaurantId: e.restaurantId || null,
        props: (e.props as object) ?? null,
      }));
      const result = await this.prisma.onboardingEvent.createMany({
        data,
        skipDuplicates: false,
      });
      return { count: result.count };
    } catch (error) {
      // Tracking nunca debe romper la UX: log y devolver 0.
      this.logger.warn(
        `Failed to persist onboarding events: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { count: 0 };
    }
  }

  async getFunnel(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const grouped = await this.prisma.onboardingEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    // Únicos por sesión + evento (más útil que totales).
    const uniqueRows = await this.prisma.$queryRaw<
      Array<{ event: string; sessions: bigint }>
    >`
      SELECT "event", COUNT(DISTINCT "sessionId")::bigint AS sessions
      FROM "OnboardingEvent"
      WHERE "createdAt" >= ${since}
      GROUP BY "event"
    `;

    const sourceRows = await this.prisma.$queryRaw<
      Array<{ event: string; source: string | null; sessions: bigint }>
    >`
      SELECT
        "event",
        COALESCE("props"->>'source', 'unknown') AS source,
        COUNT(DISTINCT "sessionId")::bigint AS sessions
      FROM "OnboardingEvent"
      WHERE "createdAt" >= ${since}
        AND "event" IN ('landing_cta_clicked', 'landing_demo_clicked', 'landing_whatsapp_clicked', 'trial_banner_cta_clicked', 'trial_help_whatsapp_clicked', 'trial_payment_modal_opened')
      GROUP BY "event", COALESCE("props"->>'source', 'unknown')
      ORDER BY "event", sessions DESC
    `;

    const totals = new Map<string, number>();
    grouped.forEach((g) => totals.set(g.event, g._count._all));
    const sessions = new Map<string, number>();
    uniqueRows.forEach((r) => sessions.set(r.event, Number(r.sessions)));

    const steps = FUNNEL_STEPS.map((event, idx) => {
      const sessionsCount = sessions.get(event) ?? 0;
      const previousSessions =
        idx === 0 ? null : (sessions.get(FUNNEL_STEPS[idx - 1]) ?? 0);
      const conversionFromPrev =
        previousSessions && previousSessions > 0
          ? Math.round((sessionsCount / previousSessions) * 1000) / 10
          : null;
      return {
        event,
        totalEvents: totals.get(event) ?? 0,
        uniqueSessions: sessionsCount,
        conversionFromPrev,
      };
    });

    const firstSessions = sessions.get(FUNNEL_STEPS[0]) ?? 0;
    const lastSessions = sessions.get('preview_published') ?? 0;
    const overallConversion =
      firstSessions > 0
        ? Math.round((lastSessions / firstSessions) * 1000) / 10
        : null;

    const conversion = (from: string, to: string): number | null => {
      const fromCount = sessions.get(from) ?? 0;
      const toCount = sessions.get(to) ?? 0;
      if (fromCount <= 0) return null;
      return Math.round((toCount / fromCount) * 1000) / 10;
    };

    const sourceByEvent = new Map<
      string,
      Array<{ source: string; sessions: number }>
    >();
    sourceRows.forEach((row) => {
      const key = row.event;
      const list = sourceByEvent.get(key) ?? [];
      list.push({
        source: row.source || 'unknown',
        sessions: Number(row.sessions),
      });
      sourceByEvent.set(key, list);
    });

    const topSources = (event: string, limit = 5) =>
      (sourceByEvent.get(event) ?? [])
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, limit);

    return {
      sinceDays: days,
      since: since.toISOString(),
      steps,
      overallConversion,
      highlights: {
        landingToRegisterConversion: conversion(
          'landing_viewed',
          'register_started',
        ),
        registerToPublishConversion: conversion(
          'register_started',
          'preview_published',
        ),
        publishToDashboardConversion: conversion(
          'preview_published',
          'first_dashboard_visit',
        ),
        trialBannerToPaymentIntentConversion: conversion(
          'trial_banner_viewed',
          'trial_banner_cta_clicked',
        ),
        trialIntentToPaymentSavedConversion: conversion(
          'trial_banner_cta_clicked',
          'trial_payment_method_saved',
        ),
        goLiveToPaymentSavedConversion: conversion(
          'go_live_completed',
          'trial_payment_method_saved',
        ),
        trialBannerSessions: sessions.get('trial_banner_viewed') ?? 0,
        trialPaymentIntentSessions:
          sessions.get('trial_banner_cta_clicked') ?? 0,
        trialPaymentMethodSavedSessions:
          sessions.get('trial_payment_method_saved') ?? 0,
        trialHelpSessions: sessions.get('trial_help_whatsapp_clicked') ?? 0,
        customerWhatsappNotifiedSessions:
          sessions.get('customer_whatsapp_notified') ?? 0,
        customerWhatsappNotificationsTotal:
          totals.get('customer_whatsapp_notified') ?? 0,
      },
      topSources: {
        landingCta: topSources('landing_cta_clicked'),
        landingDemo: topSources('landing_demo_clicked'),
        landingWhatsapp: topSources('landing_whatsapp_clicked'),
        trialPaymentIntent: topSources('trial_banner_cta_clicked'),
        trialPaymentSaved: topSources('trial_payment_method_saved'),
        trialHelp: topSources('trial_help_whatsapp_clicked'),
      },
    };
  }

  /**
   * Cohorte de retención por día de primer evento (proxy de “activación”).
   * D1 = usó la app al día siguiente. D7 = volvió una semana después. D30 = volvió al mes.
   * Ignora cohortes sin suficiente madurez para D7 (últimos 7 días).
   */
  async getRetentionCohorts(days = 30) {
    const safeDays = Math.min(Math.max(days, 7), 90);

    const rows = await this.prisma.$queryRaw<
      Array<{
        cohort_day: Date;
        users: bigint;
        d1: bigint;
        d7: bigint;
        d30: bigint;
      }>
    >`
      WITH cohort AS (
        SELECT "userId", DATE(MIN("createdAt")) AS cohort_day
        FROM "OnboardingEvent"
        WHERE "userId" IS NOT NULL
          AND "createdAt" >= CURRENT_DATE - (${safeDays}::int || ' day')::interval
        GROUP BY "userId"
      ),
      activity AS (
        SELECT DISTINCT "userId", DATE("createdAt") AS day
        FROM "OnboardingEvent"
        WHERE "userId" IS NOT NULL
      )
      SELECT
        c.cohort_day,
        COUNT(DISTINCT c."userId")::bigint AS users,
        COUNT(DISTINCT CASE WHEN a.day = c.cohort_day + INTERVAL '1 day' THEN c."userId" END)::bigint AS d1,
        COUNT(DISTINCT CASE WHEN a.day = c.cohort_day + INTERVAL '7 day' THEN c."userId" END)::bigint AS d7,
        COUNT(DISTINCT CASE WHEN a.day = c.cohort_day + INTERVAL '30 day' THEN c."userId" END)::bigint AS d30
      FROM cohort c
      LEFT JOIN activity a ON a."userId" = c."userId"
      GROUP BY c.cohort_day
      ORDER BY c.cohort_day DESC
    `;

    const cohorts = rows.map((r) => {
      const users = Number(r.users);
      const d1 = Number(r.d1);
      const d7 = Number(r.d7);
      const d30 = Number(r.d30);
      return {
        cohortDay: r.cohort_day.toISOString().slice(0, 10),
        users,
        d1Count: d1,
        d7Count: d7,
        d30Count: d30,
        d1Rate: users > 0 ? Math.round((d1 / users) * 1000) / 10 : null,
        d7Rate: users > 0 ? Math.round((d7 / users) * 1000) / 10 : null,
        d30Rate: users > 0 ? Math.round((d30 / users) * 1000) / 10 : null,
      };
    });

    const matureForD1 = cohorts.filter(
      (c) =>
        new Date(c.cohortDay).getTime() <= Date.now() - 2 * 24 * 60 * 60 * 1000,
    );
    const matureForD7 = cohorts.filter(
      (c) =>
        new Date(c.cohortDay).getTime() <= Date.now() - 8 * 24 * 60 * 60 * 1000,
    );
    const matureForD30 = cohorts.filter(
      (c) =>
        new Date(c.cohortDay).getTime() <=
        Date.now() - 31 * 24 * 60 * 60 * 1000,
    );

    const sumUsersD1 = matureForD1.reduce((acc, c) => acc + c.users, 0);
    const sumD1 = matureForD1.reduce((acc, c) => acc + c.d1Count, 0);
    const sumUsersD7 = matureForD7.reduce((acc, c) => acc + c.users, 0);
    const sumD7 = matureForD7.reduce((acc, c) => acc + c.d7Count, 0);
    const sumUsersD30 = matureForD30.reduce((acc, c) => acc + c.users, 0);
    const sumD30 = matureForD30.reduce((acc, c) => acc + c.d30Count, 0);

    return {
      sinceDays: safeDays,
      cohorts,
      averageD1Rate:
        sumUsersD1 > 0 ? Math.round((sumD1 / sumUsersD1) * 1000) / 10 : null,
      averageD7Rate:
        sumUsersD7 > 0 ? Math.round((sumD7 / sumUsersD7) * 1000) / 10 : null,
      averageD30Rate:
        sumUsersD30 > 0 ? Math.round((sumD30 / sumUsersD30) * 1000) / 10 : null,
      sampleUsersD1: sumUsersD1,
      sampleUsersD7: sumUsersD7,
      sampleUsersD30: sumUsersD30,
    };
  }

  async getAttributionBreakdown(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.prisma.$queryRaw<
      Array<{
        channel: string;
        source: string;
        medium: string;
        campaign: string;
        sessions: number;
        landings: number;
        registrations: number;
        publications: number;
      }>
    >`
      WITH session_attr AS (
        SELECT DISTINCT ON ("sessionId")
          "sessionId",
          COALESCE("props"->>'utm_campaign', '(sin campaña)') AS campaign,
          COALESCE("props"->>'utm_source', 'direct') AS source,
          COALESCE("props"->>'utm_medium', '-') AS medium,
          CASE
            WHEN "props"->>'gclid' IS NOT NULL THEN 'google'
            WHEN "props"->>'fbclid' IS NOT NULL THEN 'meta'
            WHEN "props"->>'utm_source' = 'google' THEN 'google'
            WHEN "props"->>'utm_source' = 'meta' THEN 'meta'
            ELSE COALESCE("props"->>'utm_source', 'direct')
          END AS channel
        FROM "OnboardingEvent"
        WHERE "createdAt" >= ${since}
          AND (
            "props"->>'utm_campaign' IS NOT NULL
            OR "props"->>'utm_source' IS NOT NULL
            OR "props"->>'gclid' IS NOT NULL
            OR "props"->>'fbclid' IS NOT NULL
          )
        ORDER BY "sessionId", "createdAt" ASC
      ),
      session_funnel AS (
        SELECT
          "sessionId",
          MAX(CASE WHEN "event" = 'landing_viewed' THEN 1 ELSE 0 END) AS landed,
          MAX(CASE WHEN "event" = 'register_completed' THEN 1 ELSE 0 END) AS registered,
          MAX(CASE WHEN "event" = 'preview_published' THEN 1 ELSE 0 END) AS published
        FROM "OnboardingEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY "sessionId"
      )
      SELECT
        sa.channel,
        sa.source,
        sa.medium,
        sa.campaign,
        COUNT(*)::int AS sessions,
        SUM(sf.landed)::int AS landings,
        SUM(sf.registered)::int AS registrations,
        SUM(sf.published)::int AS publications
      FROM session_attr sa
      INNER JOIN session_funnel sf ON sf."sessionId" = sa."sessionId"
      GROUP BY sa.channel, sa.source, sa.medium, sa.campaign
      ORDER BY registrations DESC, sessions DESC
      LIMIT 50
    `;

    const organicRow = await this.prisma.$queryRaw<
      Array<{
        landings: number;
        registrations: number;
        publications: number;
      }>
    >`
      WITH attributed_sessions AS (
        SELECT DISTINCT "sessionId"
        FROM "OnboardingEvent"
        WHERE "createdAt" >= ${since}
          AND (
            "props"->>'utm_campaign' IS NOT NULL
            OR "props"->>'utm_source' IS NOT NULL
            OR "props"->>'gclid' IS NOT NULL
            OR "props"->>'fbclid' IS NOT NULL
          )
      ),
      session_funnel AS (
        SELECT
          "sessionId",
          MAX(CASE WHEN "event" = 'landing_viewed' THEN 1 ELSE 0 END) AS landed,
          MAX(CASE WHEN "event" = 'register_completed' THEN 1 ELSE 0 END) AS registered,
          MAX(CASE WHEN "event" = 'preview_published' THEN 1 ELSE 0 END) AS published
        FROM "OnboardingEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY "sessionId"
      )
      SELECT
        SUM(sf.landed)::int AS landings,
        SUM(sf.registered)::int AS registrations,
        SUM(sf.published)::int AS publications
      FROM session_funnel sf
      WHERE sf."sessionId" NOT IN (SELECT "sessionId" FROM attributed_sessions)
    `;

    const organic = organicRow[0] ?? {
      landings: 0,
      registrations: 0,
      publications: 0,
    };

    return {
      sinceDays: days,
      since: since.toISOString(),
      campaigns: rows.map((row) => ({
        channel: row.channel,
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        sessions: Number(row.sessions),
        landings: Number(row.landings),
        registrations: Number(row.registrations),
        publications: Number(row.publications),
        registerRate:
          row.landings > 0
            ? Math.round(
                (Number(row.registrations) / Number(row.landings)) * 1000,
              ) / 10
            : null,
      })),
      organic: {
        landings: Number(organic.landings),
        registrations: Number(organic.registrations),
        publications: Number(organic.publications),
        registerRate:
          Number(organic.landings) > 0
            ? Math.round(
                (Number(organic.registrations) / Number(organic.landings)) *
                  1000,
              ) / 10
            : null,
      },
    };
  }
}
