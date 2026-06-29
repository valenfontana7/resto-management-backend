import { Injectable, OnModuleInit } from '@nestjs/common';
import { BusinessMemoryCategory } from '@prisma/client';
import { BusinessMemoryService } from '../../business-memory/business-memory.service';
import { BusinessEventBusService } from '../business-event-bus.service';
import type { BentooBusinessEvent } from '../types/business-event.types';
import { BentooBusinessEventType } from '../types/event-type.enum';

/**
 * Stores semantic event history in Business Memory — no direct coupling
 * from orders/reservations modules into memory logic.
 */
@Injectable()
export class BusinessMemoryEventSubscriber implements OnModuleInit {
  readonly id = 'business-memory';

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly businessMemory: BusinessMemoryService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    switch (event.eventType) {
      case BentooBusinessEventType.OrderCreated:
        await this.recordOrderCreated(
          event as BentooBusinessEvent<BentooBusinessEventType.OrderCreated>,
        );
        break;
      case BentooBusinessEventType.ReservationConfirmed:
        await this.recordReservationConfirmed(
          event as BentooBusinessEvent<BentooBusinessEventType.ReservationConfirmed>,
        );
        break;
      case BentooBusinessEventType.ReservationNoShow:
        await this.recordReservationNoShow(
          event as BentooBusinessEvent<BentooBusinessEventType.ReservationNoShow>,
        );
        break;
      case BentooBusinessEventType.ProductOutOfStock:
        await this.recordProductOutOfStock(
          event as BentooBusinessEvent<BentooBusinessEventType.ProductOutOfStock>,
        );
        break;
      case BentooBusinessEventType.OrderDelayed:
        await this.recordOrderDelayed(
          event as BentooBusinessEvent<BentooBusinessEventType.OrderDelayed>,
        );
        break;
      case BentooBusinessEventType.DailyClosingMissing:
        await this.recordDailyClosingMissing(
          event as BentooBusinessEvent<BentooBusinessEventType.DailyClosingMissing>,
        );
        break;
      case BentooBusinessEventType.DailyClosingCompleted:
        await this.recordDailyClosingCompleted(
          event as BentooBusinessEvent<BentooBusinessEventType.DailyClosingCompleted>,
        );
        break;
      case BentooBusinessEventType.PaymentFailed:
        await this.recordPaymentFailed(
          event as BentooBusinessEvent<BentooBusinessEventType.PaymentFailed>,
        );
        break;
      case BentooBusinessEventType.PaymentRecovered:
        await this.recordPaymentRecovered(
          event as BentooBusinessEvent<BentooBusinessEventType.PaymentRecovered>,
        );
        break;
      case BentooBusinessEventType.PriceChanged:
        await this.recordPriceChanged(
          event as BentooBusinessEvent<BentooBusinessEventType.PriceChanged>,
        );
        break;
      case BentooBusinessEventType.MenuUpdated:
        await this.recordMenuUpdated(
          event as BentooBusinessEvent<BentooBusinessEventType.MenuUpdated>,
        );
        break;
      case BentooBusinessEventType.CustomerReturned:
        await this.recordCustomerReturned(
          event as BentooBusinessEvent<BentooBusinessEventType.CustomerReturned>,
        );
        break;
      case BentooBusinessEventType.CustomerInactive:
        await this.recordCustomerInactive(
          event as BentooBusinessEvent<BentooBusinessEventType.CustomerInactive>,
        );
        break;
      case BentooBusinessEventType.MarketingPublished:
        await this.recordMarketingPublished(
          event as BentooBusinessEvent<BentooBusinessEventType.MarketingPublished>,
        );
        break;
      default:
        await this.recordGenericEvent(event);
        break;
    }
  }

  private async recordOrderCreated(
    event: BentooBusinessEvent<BentooBusinessEventType.OrderCreated>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:${event.eventType}:${payload.orderId}`,
      category: BusinessMemoryCategory.SALES,
      title: `Pedido #${payload.orderNumber}`,
      summary: `${payload.customerName} — ${payload.itemCount} ítems — $${payload.total}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        payload,
        isReplay: event.isReplay ?? false,
      },
    });
  }

  private async recordReservationConfirmed(
    event: BentooBusinessEvent<BentooBusinessEventType.ReservationConfirmed>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:${event.eventType}:${payload.reservationId}`,
      category: BusinessMemoryCategory.OPERATIONAL,
      title: `Reserva confirmada — ${payload.customerName}`,
      summary: `${payload.date} ${payload.time} · ${payload.partySize} personas`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        payload,
        isReplay: event.isReplay ?? false,
      },
    });
  }

  private async recordReservationNoShow(
    event: BentooBusinessEvent<BentooBusinessEventType.ReservationNoShow>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:reservation:no-show:${payload.reservationId}`,
      category: BusinessMemoryCategory.CUSTOMER,
      title: `No-show — ${payload.customerName}`,
      summary: `${payload.date} ${payload.time} · ${payload.partySize} personas no se presentaron`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        payload,
        isReplay: event.isReplay ?? false,
      },
    });
  }

  private async recordProductOutOfStock(
    event: BentooBusinessEvent<BentooBusinessEventType.ProductOutOfStock>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:inventory:out-of-stock:${payload.dishId}`,
      category: BusinessMemoryCategory.INVENTORY,
      title: `Sin stock — ${payload.dishName}`,
      summary: 'Plato deshabilitado automáticamente por quiebre de insumos',
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordOrderDelayed(
    event: BentooBusinessEvent<BentooBusinessEventType.OrderDelayed>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:order:delayed:${payload.orderId}`,
      category: BusinessMemoryCategory.OPERATIONAL,
      title: `Pedido demorado #${payload.orderNumber}`,
      summary: `${payload.delayMinutes} minutos en ${payload.status}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordDailyClosingMissing(
    event: BentooBusinessEvent<BentooBusinessEventType.DailyClosingMissing>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:daily-closing:missing:${payload.date}`,
      category: BusinessMemoryCategory.OPERATIONAL,
      title: 'Cierre diario pendiente',
      summary: `Sin cierre registrado para ${payload.date}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordDailyClosingCompleted(
    event: BentooBusinessEvent<BentooBusinessEventType.DailyClosingCompleted>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:daily-closing:completed:${payload.date}`,
      category: BusinessMemoryCategory.OPERATIONAL,
      title: `Cierre diario completado`,
      summary: `Ventas del día: $${payload.totalSales}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordPaymentFailed(
    event: BentooBusinessEvent<BentooBusinessEventType.PaymentFailed>,
  ): Promise<void> {
    const payload = event.payload;
    const key = payload.checkoutSessionId ?? payload.orderId ?? event.id;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:payment:failed:${key}`,
      category: BusinessMemoryCategory.SALES,
      title: 'Pago online fallido',
      summary: payload.reason
        ? `Cobro de $${payload.amount} — ${payload.reason}`
        : `Cobro de $${payload.amount} no completado`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordPaymentRecovered(
    event: BentooBusinessEvent<BentooBusinessEventType.PaymentRecovered>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:payment:recovered:${payload.orderId}`,
      category: BusinessMemoryCategory.SALES,
      title: `Pago recuperado #${payload.orderNumber}`,
      summary: `Cobro de $${payload.amount} acreditado`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordPriceChanged(
    event: BentooBusinessEvent<BentooBusinessEventType.PriceChanged>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:menu:price:${payload.dishId}`,
      category: BusinessMemoryCategory.INVENTORY,
      title: `Precio — ${payload.dishName}`,
      summary: `$${payload.previousPrice} → $${payload.newPrice}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordMenuUpdated(
    event: BentooBusinessEvent<BentooBusinessEventType.MenuUpdated>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:menu:updated:${payload.changeType}:${payload.entityId}`,
      category: BusinessMemoryCategory.INVENTORY,
      title: `Menú actualizado — ${payload.entityName}`,
      summary: `Cambio en ${payload.changeType}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordCustomerReturned(
    event: BentooBusinessEvent<BentooBusinessEventType.CustomerReturned>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:customer:returned:${payload.customerProfileId}`,
      category: BusinessMemoryCategory.CUSTOMER,
      title: `Cliente que vuelve — ${payload.customerName}`,
      summary: `Volvió después de ${payload.daysSinceLastOrder} días`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordCustomerInactive(
    event: BentooBusinessEvent<BentooBusinessEventType.CustomerInactive>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:customer:inactive:${payload.customerProfileId}`,
      category: BusinessMemoryCategory.CUSTOMER,
      title: `Cliente inactivo — ${payload.customerName}`,
      summary: `${payload.daysInactive} días sin pedir`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordMarketingPublished(
    event: BentooBusinessEvent<BentooBusinessEventType.MarketingPublished>,
  ): Promise<void> {
    const payload = event.payload;
    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:marketing:published:${event.id}`,
      category: BusinessMemoryCategory.MARKETING,
      title: `Publicado — ${payload.title}`,
      summary: `Canal: ${payload.channel}`,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: { eventId: event.id, payload },
    });
  }

  private async recordGenericEvent(event: BentooBusinessEvent): Promise<void> {
    if (event.isReplay) return;

    await this.businessMemory.recordFromBusinessEvent(event.restaurantId, {
      memoryKey: `event:${event.eventType}:${event.id}`,
      category: BusinessMemoryCategory.OPERATIONAL,
      title: event.eventType,
      summary: event.source,
      sourceProvider: 'business-events',
      sourceInsightId: event.id,
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        payload: event.payload,
        importance: event.importance,
      },
    });
  }
}
