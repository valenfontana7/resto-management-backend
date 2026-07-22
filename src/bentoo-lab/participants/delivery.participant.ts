import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
}

interface SalonDish {
  id: string;
  name: string;
}

export interface DeliveryParticipantContext {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
  deliveryZoneId: string;
}

@Injectable()
export class DeliveryParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async createOrder(
    ctx: DeliveryParticipantContext,
    input: {
      deliveryAddress: string;
      customerName?: string;
      customerPhone?: string;
    },
  ): Promise<{ order: DeliveryOrder }> {
    return this.http.request<{ order: DeliveryOrder }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/salon-delivery-orders`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        deliveryAddress: input.deliveryAddress,
        deliveryZoneId: ctx.deliveryZoneId,
        customerName: input.customerName ?? 'Cliente domicilio Lab',
        customerPhone: input.customerPhone ?? '+54 11 5555-0200',
        paymentMethod: 'cash',
      },
    });
  }

  async addItems(
    ctx: DeliveryParticipantContext,
    input: {
      orderId: string;
      dishName: string;
      quantity: number;
    },
  ): Promise<{ order: DeliveryOrder }> {
    const dish = await this.findSalonDish(ctx, input.dishName);
    return this.http.request<{ order: DeliveryOrder }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/salon-delivery-orders/${input.orderId}/items`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        items: [
          {
            dishId: dish.id,
            quantity: input.quantity,
            sendToKitchen: true,
          },
        ],
      },
    });
  }

  private async findSalonDish(
    ctx: DeliveryParticipantContext,
    dishName: string,
  ): Promise<SalonDish> {
    const response = await this.http.request<
      SalonDish[] | { dishes: SalonDish[] }
    >({
      path: `/api/restaurants/${ctx.restaurantId}/dishes`,
      method: 'GET',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: `${ctx.correlationId}:dishes`,
    });
    const dishes = Array.isArray(response) ? response : response.dishes;
    const dish = dishes.find((candidate) => candidate.name === dishName);
    if (!dish) {
      throw new Error(`No hay plato de salón llamado ${dishName}`);
    }
    return dish;
  }
}
