import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsPeriod } from '../analytics/dto/analytics.dto';
import { EmailService } from '../email/email.service';
import { renderDigestEmail } from '../email/email-templates';
import { ImageProcessingService } from '../common/services/image-processing.service';
import { DigestPreferencesService } from './digest-preferences.service';
import { BusinessHealthService } from '../business-health/business-health.service';
import { BusinessEventDigestService } from '../business-events/business-event-digest.service';

@Injectable()
export class DigestSchedulerService {
  private readonly logger = new Logger(DigestSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly emailService: EmailService,
    private readonly images: ImageProcessingService,
    private readonly preferencesService: DigestPreferencesService,
    private readonly businessHealthService: BusinessHealthService,
    private readonly businessEventDigest: BusinessEventDigestService,
  ) {}

  /**
   * Weekly digest: every Monday at 8:00 AM
   */
  @Cron('0 8 * * 1')
  async sendWeeklyDigests() {
    this.logger.log('Starting weekly digest emails...');
    await this.processDigests('WEEKLY', AnalyticsPeriod.WEEK);
  }

  /**
   * Daily digest: every day at 8:00 AM
   */
  @Cron('0 8 * * *')
  async sendDailyDigests() {
    this.logger.log('Starting daily digest emails...');
    await this.processDigests('DAILY', AnalyticsPeriod.TODAY);
  }

  /**
   * Monthly digest: 1st of month at 8:00 AM
   */
  @Cron('0 8 1 * *')
  async sendMonthlyDigests() {
    this.logger.log('Starting monthly digest emails...');
    await this.processDigests('MONTHLY', AnalyticsPeriod.MONTH);
  }

  private async processDigests(frequency: string, period: AnalyticsPeriod) {
    try {
      const preferences =
        await this.preferencesService.getActiveByFrequency(frequency);

      if (!preferences.length) {
        this.logger.log(`No active ${frequency} digest subscriptions`);
        return;
      }

      // Group by restaurant
      const byRestaurant = new Map<string, typeof preferences>();
      for (const pref of preferences) {
        const list = byRestaurant.get(pref.restaurantId) || [];
        list.push(pref);
        byRestaurant.set(pref.restaurantId, list);
      }

      const sentIds: string[] = [];

      for (const [restaurantId, prefs] of byRestaurant) {
        try {
          const restaurantName = prefs[0].restaurant.name;
          const html = await this.buildDigestHtml(
            restaurantId,
            restaurantName,
            period,
            frequency,
          );

          for (const pref of prefs) {
            const success = await this.emailService.sendGenericEmail(
              pref.email,
              this.getSubject(restaurantName, frequency),
              html,
              restaurantName,
            );
            if (success) sentIds.push(pref.id);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Failed digest for restaurant ${restaurantId}: ${message}`,
          );
        }
      }

      if (sentIds.length) {
        await this.preferencesService.markSent(sentIds);
      }

      this.logger.log(
        `${frequency} digest: sent ${sentIds.length}/${preferences.length} emails`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process ${frequency} digests: ${message}`);
    }
  }

  private getSubject(restaurantName: string, frequency: string): string {
    const labels: Record<string, string> = {
      DAILY: 'Resumen diario',
      WEEKLY: 'Resumen semanal',
      MONTHLY: 'Resumen mensual',
    };
    return `Resumen ${labels[frequency] || ''} · ${restaurantName}`;
  }

  private async buildDigestHtml(
    restaurantId: string,
    restaurantName: string,
    period: AnalyticsPeriod,
    frequency: string,
  ): Promise<string> {
    // Gather analytics
    const [salesResult, topDishesResult, revenueBreakdownResult] =
      await Promise.all([
        this.analyticsService.getSales(restaurantId, period),
        this.analyticsService.getTopDishes(restaurantId, period, 5),
        this.analyticsService.getRevenueBreakdown(restaurantId, period),
      ]);

    const salesData = salesResult.salesData || [];
    const totalSales = salesData.reduce(
      (s: number, d: { sales: number }) => s + d.sales,
      0,
    );
    const totalOrders = salesData.reduce(
      (s: number, d: { orders: number }) => s + d.orders,
      0,
    );
    const avgTicket =
      totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    const topDishes: { name: string; orders: number; revenue: number }[] =
      (topDishesResult as any)?.topDishes || [];
    const breakdown: { type: string; orders: number; revenue: number }[] =
      (revenueBreakdownResult as any)?.breakdown || [];

    const periodLabel: Record<string, string> = {
      DAILY: 'Resumen de hoy',
      WEEKLY: 'Resumen de la semana',
      MONTHLY: 'Resumen del mes',
    };

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { logo: true },
    });
    const logoUrl = await this.images.toEmailAssetUrl(restaurant?.logo ?? null);

    const healthInsights =
      frequency === 'WEEKLY'
        ? await this.businessHealthService.getDigestSnapshot(restaurantId)
        : null;

    const { since, until } = this.resolveEventWindow(frequency);
    const eventHighlights = await this.businessEventDigest.getHighlights(
      restaurantId,
      since,
      until,
    );

    return renderDigestEmail({
      title: this.getSubject(restaurantName, frequency),
      periodLabel: periodLabel[frequency] || '',
      totalSales,
      totalOrders,
      avgTicket,
      topDishes,
      breakdown,
      logoUrl,
      restaurantName,
      healthInsights,
      eventHighlights,
    });
  }

  private resolveEventWindow(frequency: string): { since: Date; until: Date } {
    const until = new Date();
    const since = new Date(until);

    if (frequency === 'DAILY') {
      since.setDate(since.getDate() - 1);
    } else if (frequency === 'WEEKLY') {
      since.setDate(since.getDate() - 7);
    } else {
      since.setMonth(since.getMonth() - 1);
    }

    return { since, until };
  }
}
