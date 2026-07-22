import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface KitchenOrder {
  id: string;
  status: string;
  createdAt: string;
}

interface OrdersResponse {
  orders: KitchenOrder[];
}

interface UpdateStatusResponse {
  order: KitchenOrder;
}

export interface KitchenActionInput {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
  expectedOrderId?: string;
}

@Injectable()
export class KitchenParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async startOldestConfirmed(
    input: KitchenActionInput,
  ): Promise<UpdateStatusResponse> {
    const order = await this.findOldestByStatus(input, 'CONFIRMED');
    if (input.expectedOrderId && order.id !== input.expectedOrderId) {
      throw new Error(
        `Cocina seleccionó ${order.id}, pero se esperaba ${input.expectedOrderId}`,
      );
    }
    return this.updateStatus(input, order.id, 'PREPARING');
  }

  async markReady(input: KitchenActionInput): Promise<UpdateStatusResponse> {
    const order = await this.findOldestByStatus(input, 'PREPARING');
    if (input.expectedOrderId && order.id !== input.expectedOrderId) {
      throw new Error(
        `Cocina encontró ${order.id}, pero se esperaba ${input.expectedOrderId}`,
      );
    }
    return this.updateStatus(input, order.id, 'READY');
  }

  async markDelivered(
    input: KitchenActionInput,
  ): Promise<UpdateStatusResponse> {
    const orderId = input.expectedOrderId;
    if (!orderId) {
      throw new Error('markDelivered requiere expectedOrderId');
    }
    return this.updateStatus(input, orderId, 'DELIVERED');
  }

  private async findOldestByStatus(
    input: KitchenActionInput,
    status: 'CONFIRMED' | 'PREPARING',
  ): Promise<KitchenOrder> {
    const response = await this.http.request<OrdersResponse>({
      path: `/api/restaurants/${input.restaurantId}/orders?status=${status}&limit=50`,
      method: 'GET',
      jwt: input.jwt,
      runId: input.runId,
      participantKey: 'kitchen',
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: `${input.correlationId}:query`,
    });
    const order = [...response.orders].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    )[0];
    if (!order) {
      throw new Error(`Cocina no encontró pedidos en estado ${status}`);
    }
    return order;
  }

  private updateStatus(
    input: KitchenActionInput,
    orderId: string,
    status: 'PREPARING' | 'READY' | 'DELIVERED',
  ): Promise<UpdateStatusResponse> {
    return this.http.request<UpdateStatusResponse>({
      path: `/api/restaurants/${input.restaurantId}/orders/${orderId}/status`,
      method: 'PATCH',
      jwt: input.jwt,
      runId: input.runId,
      participantKey: status === 'DELIVERED' ? 'manager' : 'kitchen',
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: input.correlationId,
      body: {
        status,
        notes: `Bentoo Lab: ${status}`,
      },
    });
  }
}
