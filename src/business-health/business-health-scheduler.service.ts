import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RestaurantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessHealthService } from './business-health.service';
import { getGrowthSettings } from './business-health-growth.util';

@Injectable()
export class BusinessHealthSchedulerService {
  private readonly logger = new Logger(BusinessHealthSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessHealth: BusinessHealthService,
  ) {}

  /** Persiste score diario para tendencia (06:05 UTC). */
  @Cron('5 6 * * *')
  async recordDailyHealthSnapshots() {
    this.logger.log('Registrando snapshots diarios de salud del negocio...');
    await this.processActiveRestaurants(async (restaurantId) => {
      await this.businessHealth.recordDailySnapshot(restaurantId);
    });
  }

  /** Win-back automático semanal (martes 10:00 UTC) para locales con opt-in. */
  @Cron('0 10 * * 2')
  async runScheduledWinBackCampaigns() {
    this.logger.log('Iniciando campañas programadas de win-back...');
    let totalSent = 0;

    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        status: RestaurantStatus.ACTIVE,
        onboardingIncomplete: false,
      },
      select: { id: true, businessRules: true },
    });

    for (const restaurant of restaurants) {
      const settings = getGrowthSettings(restaurant.businessRules);
      if (!settings.autoWinBackEnabled) continue;

      try {
        const result = await this.businessHealth.runScheduledWinBack(
          restaurant.id,
        );
        totalSent += result.sent;
        if (result.sent > 0) {
          this.logger.log(
            `Win-back programado ${restaurant.id}: ${result.sent} enviado(s), ${result.failed} fallido(s)`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Win-back programado falló para ${restaurant.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Win-back programado completado: ${totalSent} email(s) enviados`,
    );
  }

  private async processActiveRestaurants(
    handler: (restaurantId: string) => Promise<void>,
  ) {
    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        status: RestaurantStatus.ACTIVE,
        onboardingIncomplete: false,
      },
      select: { id: true },
    });

    let recorded = 0;
    for (const restaurant of restaurants) {
      try {
        await handler(restaurant.id);
        recorded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Snapshot de salud falló para ${restaurant.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Snapshots de salud: ${recorded}/${restaurants.length} restaurantes procesados`,
    );
  }
}
