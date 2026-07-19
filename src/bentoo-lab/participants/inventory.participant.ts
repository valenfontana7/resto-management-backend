import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface InventoryItemRow {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  autoDisableDishes: boolean;
  linkedDishIds: string[];
}

interface InventoryListResponse {
  items: InventoryItemRow[];
}

interface InventoryMutationResponse {
  item: InventoryItemRow;
  availability?: {
    disabledDishIds: string[];
    reEnabledDishIds: string[];
  };
}

interface PaidOrderResponse {
  order: {
    id: string;
    paymentStatus: string;
    status: string;
  };
}

export interface ManagerPayOrderInput {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
  orderId: string;
}

export interface StockoutInput {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
  inventoryItemId: string;
}

@Injectable()
export class InventoryParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async markOrderPaid(input: ManagerPayOrderInput): Promise<{
    orderId: string;
    paymentStatus: string;
    stockAfter: InventoryItemRow[];
  }> {
    const before = await this.listItems(input);
    const paid = await this.http.request<PaidOrderResponse>({
      path: `/api/restaurants/${input.restaurantId}/orders/${input.orderId}/payment`,
      method: 'PATCH',
      jwt: input.jwt,
      runId: input.runId,
      participantKey: 'manager',
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: input.correlationId,
      body: { paymentMethod: 'cash' },
    });

    const stockAfter = await this.waitForStockChange(
      input,
      before.items,
      8_000,
    );

    return {
      orderId: paid.order.id,
      paymentStatus: paid.order.paymentStatus,
      stockAfter,
    };
  }

  async forceStockout(input: StockoutInput): Promise<{
    item: InventoryItemRow;
    disabledDishIds: string[];
  }> {
    const response = await this.http.request<InventoryMutationResponse>({
      path: `/api/restaurants/${input.restaurantId}/inventory-items/${input.inventoryItemId}`,
      method: 'PATCH',
      jwt: input.jwt,
      runId: input.runId,
      participantKey: 'manager',
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: input.correlationId,
      body: {
        currentStock: 0,
        autoDisableDishes: true,
      },
    });

    if (response.item.currentStock > 0) {
      throw new Error(
        `Stockout Lab no dejó stock en 0 (quedó ${response.item.currentStock})`,
      );
    }

    return {
      item: response.item,
      disabledDishIds: response.availability?.disabledDishIds ?? [],
    };
  }

  async listItems(input: {
    runId: string;
    restaurantId: string;
    jwt: string;
    simulatedNow: Date;
    correlationId: string;
  }): Promise<InventoryListResponse> {
    return this.http.request<InventoryListResponse>({
      path: `/api/restaurants/${input.restaurantId}/inventory-items`,
      method: 'GET',
      jwt: input.jwt,
      runId: input.runId,
      participantKey: 'manager',
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: `${input.correlationId}:inventory-list`,
    });
  }

  private async waitForStockChange(
    input: ManagerPayOrderInput,
    before: InventoryItemRow[],
    timeoutMs: number,
  ): Promise<InventoryItemRow[]> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const listed = await this.listItems({
        ...input,
        correlationId: `${input.correlationId}:poll`,
      });
      const changed = listed.items.some((item) => {
        const previous = before.find((candidate) => candidate.id === item.id);
        return previous != null && item.currentStock < previous.currentStock;
      });
      if (changed) {
        return listed.items;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      'Bentoo Lab no observó consumo de stock tras marcar el pedido como pagado',
    );
  }
}
