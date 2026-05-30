import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackOnboardingEventDto } from './dto/track-event.dto';

export const FUNNEL_STEPS = [
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

    return {
      sinceDays: days,
      since: since.toISOString(),
      steps,
      overallConversion,
    };
  }

  /**
   * Cohorte de retención por día de primer evento (proxy de “activación”).
   * D1 = usó la app al día siguiente. D7 = volvió una semana después.
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
        COUNT(DISTINCT CASE WHEN a.day = c.cohort_day + INTERVAL '7 day' THEN c."userId" END)::bigint AS d7
      FROM cohort c
      LEFT JOIN activity a ON a."userId" = c."userId"
      GROUP BY c.cohort_day
      ORDER BY c.cohort_day DESC
    `;

    const cohorts = rows.map((r) => {
      const users = Number(r.users);
      const d1 = Number(r.d1);
      const d7 = Number(r.d7);
      return {
        cohortDay: r.cohort_day.toISOString().slice(0, 10),
        users,
        d1Count: d1,
        d7Count: d7,
        d1Rate: users > 0 ? Math.round((d1 / users) * 1000) / 10 : null,
        d7Rate: users > 0 ? Math.round((d7 / users) * 1000) / 10 : null,
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

    const sumUsersD1 = matureForD1.reduce((acc, c) => acc + c.users, 0);
    const sumD1 = matureForD1.reduce((acc, c) => acc + c.d1Count, 0);
    const sumUsersD7 = matureForD7.reduce((acc, c) => acc + c.users, 0);
    const sumD7 = matureForD7.reduce((acc, c) => acc + c.d7Count, 0);

    return {
      sinceDays: safeDays,
      cohorts,
      averageD1Rate:
        sumUsersD1 > 0 ? Math.round((sumD1 / sumUsersD1) * 1000) / 10 : null,
      averageD7Rate:
        sumUsersD7 > 0 ? Math.round((sumD7 / sumUsersD7) * 1000) / 10 : null,
      sampleUsersD1: sumUsersD1,
      sampleUsersD7: sumUsersD7,
    };
  }
}
