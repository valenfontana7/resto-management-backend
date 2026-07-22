import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface FloorTable {
  id: string;
  number: string;
  status: string;
  currentSessionId?: string | null;
}

interface FloorSessionItem {
  id: string;
  name: string;
  kitchenStatus: string;
  paidInOrderId?: string | null;
  createdAt?: string;
}

interface FloorSession {
  id: string;
  sessionNumber: string;
  status: string;
  tableId: string;
  total: number;
  items: FloorSessionItem[];
}

interface SalonDish {
  id: string;
  name: string;
  price: number;
  isAvailableInSalon?: boolean;
}

export interface FloorCloseResult {
  session: FloorSession;
  order?: { id: string; orderNumber: string; total: number };
  fiscalDocument?: {
    id?: string;
    cae?: string | null;
    status?: string;
    type?: string;
  } | null;
  partial?: boolean;
}

export interface FloorParticipantContext {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
}

@Injectable()
export class FloorParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async openTable(
    ctx: FloorParticipantContext,
    input: {
      tableNumber: string;
      guestCount?: number;
      customerName?: string;
    },
  ): Promise<{ session: FloorSession }> {
    const table = await this.findAvailableTable(ctx, input.tableNumber);
    return this.http.request<{ session: FloorSession }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        tableId: table.id,
        guestCount: input.guestCount ?? 2,
        customerName: input.customerName ?? `Mesa Lab ${input.tableNumber}`,
        waiterName: 'Mozo Bentoo Lab',
      },
    });
  }

  async addItems(
    ctx: FloorParticipantContext,
    input: {
      sessionId: string;
      dishName: string;
      quantity: number;
    },
  ): Promise<{ session: FloorSession }> {
    const dish = await this.findSalonDish(ctx, input.dishName);
    return this.http.request<{ session: FloorSession }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions/${input.sessionId}/items`,
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
          },
        ],
      },
    });
  }

  async sendToKitchen(
    ctx: FloorParticipantContext,
    sessionId: string,
  ): Promise<{ session: FloorSession }> {
    return this.http.request<{ session: FloorSession }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions/${sessionId}/send-kitchen`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {},
    });
  }

  async getSession(
    ctx: FloorParticipantContext,
    sessionId: string,
  ): Promise<FloorSession> {
    const response = await this.http.request<{ session: FloorSession }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions/${sessionId}`,
      method: 'GET',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: `${ctx.correlationId}:session`,
    });
    return response.session;
  }

  async mergeTables(
    ctx: FloorParticipantContext,
    input: {
      sessionId: string;
      tableNumbers: string[];
    },
  ): Promise<{ session: FloorSession; absorbedSessionIds?: string[] }> {
    const tableIds: string[] = [];
    for (const tableNumber of input.tableNumbers) {
      const table = await this.findTableForMerge(ctx, tableNumber);
      tableIds.push(table.id);
    }
    return this.http.request<{
      session: FloorSession;
      absorbedSessionIds?: string[];
    }>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions/${input.sessionId}/merge-tables`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: { tableIds },
    });
  }

  resolveUnpaidItemIds(
    session: FloorSession,
    selector: 'first-unpaid' | 'all-unpaid' = 'all-unpaid',
  ): string[] {
    // getSession ya ordena ítems por createdAt asc.
    const unpaid = session.items.filter((item) => !item.paidInOrderId);
    if (unpaid.length === 0) {
      throw new Error(
        `Sesión ${session.id} no tiene ítems impagos para cobrar`,
      );
    }
    if (selector === 'first-unpaid') {
      return [unpaid[0].id];
    }
    return unpaid.map((item) => item.id);
  }

  async closeSession(
    ctx: FloorParticipantContext,
    input: {
      sessionId: string;
      paymentMethod?: 'cash';
      participantKey?: 'manager' | 'waiter';
      itemIds?: string[];
      fiscalDocumentType?: 'INTERNAL_TICKET' | 'FACTURA_B';
      customerName?: string;
      customerDocType?: string;
      customerDocNumber?: string;
    },
  ): Promise<FloorCloseResult> {
    return this.http.request<FloorCloseResult>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/sessions/${input.sessionId}/close`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: input.participantKey ?? 'manager',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        paymentMethod: input.paymentMethod ?? 'cash',
        fiscalDocumentType: input.fiscalDocumentType ?? 'INTERNAL_TICKET',
        ...(input.itemIds?.length ? { itemIds: input.itemIds } : {}),
        ...(input.customerName ? { customerName: input.customerName } : {}),
        ...(input.customerDocType
          ? { customerDocType: input.customerDocType }
          : {}),
        ...(input.customerDocNumber
          ? { customerDocNumber: input.customerDocNumber }
          : {}),
      },
    });
  }

  private async listRestaurantTables(
    ctx: FloorParticipantContext,
  ): Promise<FloorTable[]> {
    const response = await this.http.request<{
      areas?: Array<{ tables?: FloorTable[] }>;
      tablesWithoutArea?: FloorTable[];
      tables?: FloorTable[];
    }>({
      path: `/api/tables/restaurant/${ctx.restaurantId}`,
      method: 'GET',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'waiter',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: `${ctx.correlationId}:tables`,
    });

    return [
      ...(response.tables ?? []),
      ...(response.tablesWithoutArea ?? []),
      ...(response.areas ?? []).flatMap((area) => area.tables ?? []),
    ];
  }

  private async findAvailableTable(
    ctx: FloorParticipantContext,
    tableNumber: string,
  ): Promise<FloorTable> {
    const tables = await this.listRestaurantTables(ctx);
    const table = tables.find((candidate) => candidate.number === tableNumber);
    if (!table) {
      throw new Error(`No existe la mesa ${tableNumber} en el tenant Lab`);
    }
    if (table.status === 'OCCUPIED' || table.currentSessionId) {
      throw new Error(`La mesa ${tableNumber} ya tiene una cuenta abierta`);
    }
    return table;
  }

  /** Mesa libre o con otra cuenta (absorción en merge). */
  private async findTableForMerge(
    ctx: FloorParticipantContext,
    tableNumber: string,
  ): Promise<FloorTable> {
    const tables = await this.listRestaurantTables(ctx);
    const table = tables.find((candidate) => candidate.number === tableNumber);
    if (!table) {
      throw new Error(`No existe la mesa ${tableNumber} en el tenant Lab`);
    }
    if (table.status === 'RESERVED') {
      throw new Error(`La mesa ${tableNumber} está reservada`);
    }
    return table;
  }

  private async findSalonDish(
    ctx: FloorParticipantContext,
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
