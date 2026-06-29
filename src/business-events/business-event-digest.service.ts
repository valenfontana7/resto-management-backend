import { Injectable } from '@nestjs/common';
import { BusinessEventStoreService } from './business-event-store.service';
import { BentooBusinessEventType } from './types/event-type.enum';

export interface DigestEventHighlight {
  eventType: string;
  label: string;
  count: number;
  tone: 'positive' | 'attention' | 'neutral';
}

const DIGEST_EVENT_LABELS: Partial<Record<BentooBusinessEventType, string>> = {
  [BentooBusinessEventType.OrderCreated]: 'Pedidos nuevos',
  [BentooBusinessEventType.OrderDelayed]: 'Pedidos demorados',
  [BentooBusinessEventType.PaymentFailed]: 'Pagos fallidos',
  [BentooBusinessEventType.PaymentRecovered]: 'Pagos recuperados',
  [BentooBusinessEventType.ProductOutOfStock]: 'Platos sin stock',
  [BentooBusinessEventType.ReservationNoShow]: 'No-shows',
  [BentooBusinessEventType.CustomerReturned]: 'Clientes que volvieron',
  [BentooBusinessEventType.CustomerInactive]: 'Clientes inactivos',
  [BentooBusinessEventType.DailyClosingMissing]: 'Cierres pendientes',
  [BentooBusinessEventType.MarketingSkipped]: 'Sitio sin publicar',
  [BentooBusinessEventType.DeliveryAssigned]: 'Repartos asignados',
  [BentooBusinessEventType.DeliveryCompleted]: 'Entregas completadas',
  [BentooBusinessEventType.RestaurantOpened]: 'Aperturas de turno',
  [BentooBusinessEventType.RestaurantClosed]: 'Cierres de turno',
  [BentooBusinessEventType.DailyClosingCompleted]: 'Cierres diarios',
  [BentooBusinessEventType.ReservationCreated]: 'Reservas nuevas',
  [BentooBusinessEventType.ReservationCancelled]: 'Reservas canceladas',
  [BentooBusinessEventType.ReservationPendingConfirmation]:
    'Reservas sin confirmar',
  [BentooBusinessEventType.LoyaltyPointsEarned]: 'Puntos acreditados',
  [BentooBusinessEventType.LoyaltyPointsRedeemed]: 'Puntos canjeados',
  [BentooBusinessEventType.LoyaltyTierUpgraded]:
    'Clientes que subieron de nivel',
};

const ATTENTION_TYPES = new Set<BentooBusinessEventType>([
  BentooBusinessEventType.OrderDelayed,
  BentooBusinessEventType.PaymentFailed,
  BentooBusinessEventType.ProductOutOfStock,
  BentooBusinessEventType.ReservationNoShow,
  BentooBusinessEventType.DailyClosingMissing,
  BentooBusinessEventType.MarketingSkipped,
  BentooBusinessEventType.ReservationPendingConfirmation,
]);

const POSITIVE_TYPES = new Set<BentooBusinessEventType>([
  BentooBusinessEventType.PaymentRecovered,
  BentooBusinessEventType.CustomerReturned,
  BentooBusinessEventType.DeliveryCompleted,
  BentooBusinessEventType.MarketingPublished,
  BentooBusinessEventType.DailyClosingCompleted,
  BentooBusinessEventType.LoyaltyTierUpgraded,
]);

@Injectable()
export class BusinessEventDigestService {
  constructor(private readonly store: BusinessEventStoreService) {}

  async getHighlights(
    restaurantId: string,
    since: Date,
    until: Date,
    limit = 8,
  ): Promise<DigestEventHighlight[]> {
    const events = await this.store.query(restaurantId, {
      since,
      until,
      limit: 300,
    });

    const counts = new Map<BentooBusinessEventType, number>();

    for (const event of events) {
      const type = event.eventType;
      if (!DIGEST_EVENT_LABELS[type]) continue;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    const highlights: DigestEventHighlight[] = [];

    for (const [eventType, count] of counts) {
      highlights.push({
        eventType,
        label: DIGEST_EVENT_LABELS[eventType] ?? eventType,
        count,
        tone: this.resolveTone(eventType),
      });
    }

    return highlights
      .sort((left, right) => {
        const toneOrder = { attention: 0, neutral: 1, positive: 2 };
        const toneDiff = toneOrder[left.tone] - toneOrder[right.tone];
        if (toneDiff !== 0) return toneDiff;
        return right.count - left.count;
      })
      .slice(0, limit);
  }

  private resolveTone(
    eventType: BentooBusinessEventType,
  ): DigestEventHighlight['tone'] {
    if (ATTENTION_TYPES.has(eventType)) return 'attention';
    if (POSITIVE_TYPES.has(eventType)) return 'positive';
    return 'neutral';
  }
}
