import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommercialRelationStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DecisionEngineOrchestratorService } from './decision-engine-orchestrator.service';

/**
 * Re-evaluación batch nocturna del Decision Engine. Sin esto los snapshots
 * quedan congelados si nadie visita /master (la evaluación era pull-only).
 */
@Injectable()
export class IntelligenceRefreshSchedulerService {
  private readonly logger = new Logger(
    IntelligenceRefreshSchedulerService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: DecisionEngineOrchestratorService,
  ) {}

  /** 04:30 — fuera de horario operativo de los restaurantes. */
  @Cron('30 4 * * *')
  async refreshActiveRestaurants(): Promise<void> {
    const restaurants = await this.prisma.restaurant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (restaurants.length === 0) return;

    const relations = await this.prisma.commercialRelation.findMany({
      where: { convertedRestaurantId: { not: null } },
      select: { convertedRestaurantId: true, stage: true },
    });
    const lifecycleMap = new Map<string, CommercialRelationStage>();
    for (const relation of relations) {
      if (relation.convertedRestaurantId) {
        lifecycleMap.set(relation.convertedRestaurantId, relation.stage);
      }
    }

    const ids = restaurants.map((restaurant) => restaurant.id);
    const startedAt = Date.now();
    const bundles = await this.orchestrator.getSnapshotsBatch(
      ids,
      lifecycleMap,
      { evaluateIfMissing: true, refreshStale: true },
    );

    this.logger.log(
      `Nightly intelligence refresh: ${bundles.size}/${ids.length} snapshots in ${Date.now() - startedAt}ms`,
    );
  }
}
