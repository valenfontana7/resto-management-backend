import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsPeriod } from '../analytics/dto/analytics.dto';
import { EmailService } from '../email/email.service';
import { DigestPreferencesService } from './digest-preferences.service';

@Injectable()
export class DigestSchedulerService {
  private readonly logger = new Logger(DigestSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly emailService: EmailService,
    private readonly preferencesService: DigestPreferencesService,
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
    return `📊 ${labels[frequency] || 'Resumen'} — ${restaurantName}`;
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
      DAILY: 'hoy',
      WEEKLY: 'esta semana',
      MONTHLY: 'este mes',
    };

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">📊 ${this.getSubject(restaurantName, frequency)}</h1>
      <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${periodLabel[frequency] || ''}</p>
    </div>

    <!-- KPIs -->
    <div style="padding:24px;">
      <div style="display:flex;justify-content:space-around;text-align:center;margin-bottom:24px;">
        <div>
          <p style="font-size:28px;font-weight:700;color:#1e293b;margin:0;">$${totalSales.toLocaleString()}</p>
          <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Ventas totales</p>
        </div>
        <div>
          <p style="font-size:28px;font-weight:700;color:#1e293b;margin:0;">${totalOrders}</p>
          <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Pedidos</p>
        </div>
        <div>
          <p style="font-size:28px;font-weight:700;color:#1e293b;margin:0;">$${avgTicket.toLocaleString()}</p>
          <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Ticket promedio</p>
        </div>
      </div>

      <!-- Top Dishes -->
      ${
        topDishes.length > 0
          ? `
      <h3 style="font-size:16px;color:#1e293b;margin:0 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">🏆 Top platos</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="color:#64748b;text-align:left;">
          <th style="padding:6px 0;">Plato</th>
          <th style="padding:6px 0;text-align:right;">Pedidos</th>
          <th style="padding:6px 0;text-align:right;">Revenue</th>
        </tr>
        ${topDishes
          .map(
            (d, i) => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:8px 0;">${i + 1}. ${d.name}</td>
          <td style="padding:8px 0;text-align:right;">${d.orders}</td>
          <td style="padding:8px 0;text-align:right;">$${d.revenue.toLocaleString()}</td>
        </tr>`,
          )
          .join('')}
      </table>
      `
          : ''
      }

      <!-- Revenue Breakdown -->
      ${
        breakdown.length > 0
          ? `
      <h3 style="font-size:16px;color:#1e293b;margin:24px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">📦 Desglose por tipo</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${breakdown
          .map(
            (b) => `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:8px 0;">${b.type}</td>
          <td style="padding:8px 0;text-align:right;">${b.orders} pedidos</td>
          <td style="padding:8px 0;text-align:right;">$${b.revenue.toLocaleString()}</td>
        </tr>`,
          )
          .join('')}
      </table>
      `
          : ''
      }
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#94a3b8;">
      <p style="margin:0;">Este es un resumen automático de ${restaurantName}.</p>
      <p style="margin:4px 0 0;">Para cambiar tus preferencias, visita la configuración del restaurante.</p>
    </div>
  </div>
</div>
</body>
</html>`;
  }
}
