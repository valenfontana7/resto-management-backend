import { Injectable } from '@nestjs/common';
import { OrdersGateway } from '../websocket/orders.gateway';
import type { BentooBusinessEvent } from './types/business-event.types';

@Injectable()
export class BusinessEventRealtimeService {
  constructor(private readonly ordersGateway: OrdersGateway) {}

  emit(event: BentooBusinessEvent): void {
    this.ordersGateway.emitBusinessEvent(event.restaurantId, {
      id: event.id,
      eventType: event.eventType,
      restaurantId: event.restaurantId,
      source: event.source,
      importance: event.importance,
      replayPolicy: event.replayPolicy,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      correlationId: event.correlationId ?? null,
    });
  }
}
