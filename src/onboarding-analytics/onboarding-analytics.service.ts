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
}
