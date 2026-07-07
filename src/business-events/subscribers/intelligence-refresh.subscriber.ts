import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DecisionEngineOrchestratorService } from '../../decision-engine/decision-engine-orchestrator.service';
import { BusinessEventBusService } from '../business-event-bus.service';
import type { BentooBusinessEvent } from '../types/business-event.types';
import { BentooBusinessEventType } from '../types/event-type.enum';

/** Espera de acumulación antes de reevaluar (los eventos suelen llegar en ráfaga). */
const DEBOUNCE_MS = 90_000;

/**
 * Conecta el bus de Business Events con el Decision Engine: ante eventos que
 * mueven señales del motor, reevalúa el snapshot del restaurante con debounce
 * por restaurante. Antes la evaluación era pull-only desde /master.
 */
@Injectable()
export class IntelligenceRefreshEventSubscriber
  implements OnModuleInit, OnModuleDestroy
{
  readonly id = 'intelligence-refresh';
  readonly eventTypes: BentooBusinessEventType[] = [
    BentooBusinessEventType.OrderCreated,
    BentooBusinessEventType.OrderDelayed,
    BentooBusinessEventType.PaymentFailed,
    BentooBusinessEventType.PaymentRecovered,
    BentooBusinessEventType.PaymentsVerified,
    BentooBusinessEventType.DailyClosingCompleted,
    BentooBusinessEventType.DailyClosingMissing,
    BentooBusinessEventType.ProductOutOfStock,
    BentooBusinessEventType.InventoryLowStock,
    BentooBusinessEventType.SiteStalePublished,
    BentooBusinessEventType.MenuUpdated,
    BentooBusinessEventType.ReservationNoShow,
  ];

  private readonly logger = new Logger(IntelligenceRefreshEventSubscriber.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly orchestrator: DecisionEngineOrchestratorService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    if (event.isReplay) return;
    this.scheduleRefresh(event.restaurantId);
  }

  private scheduleRefresh(restaurantId: string): void {
    const existing = this.timers.get(restaurantId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(restaurantId);
      void this.orchestrator.evaluateRestaurant(restaurantId).catch((error) => {
        this.logger.warn(
          `Intelligence refresh failed for ${restaurantId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, DEBOUNCE_MS);

    // No mantener vivo el proceso solo por el debounce.
    timer.unref?.();
    this.timers.set(restaurantId, timer);
  }
}
