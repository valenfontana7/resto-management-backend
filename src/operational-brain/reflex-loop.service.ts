import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DecisionEngineOrchestratorService } from '../decision-engine/decision-engine-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reflex Loop (H1): cerebro server-side que evalúa restaurantes activos
 * sin depender del dashboard abierto en el browser.
 */
@Injectable()
export class ReflexLoopService {
  private readonly logger = new Logger(ReflexLoopService.name);
  private running = false;

  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  /** Cada 5 minutos: refresca snapshots stale de restaurantes con actividad reciente */
  @Cron('*/5 * * * *')
  async runReflexCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeRestaurants = await this.prisma.order.findMany({
        where: { createdAt: { gte: since } },
        select: { restaurantId: true },
        distinct: ['restaurantId'],
        take: 50,
      });

      for (const { restaurantId } of activeRestaurants) {
        try {
          await this.orchestrator.evaluateRestaurant(restaurantId);
        } catch (error) {
          this.logger.warn(
            `Reflex evaluate failed for ${restaurantId}: ${String(error)}`,
          );
        }
      }

      if (activeRestaurants.length > 0) {
        this.logger.debug(
          `Reflex loop evaluated ${activeRestaurants.length} active restaurants`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
