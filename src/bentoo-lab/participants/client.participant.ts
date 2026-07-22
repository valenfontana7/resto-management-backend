import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

interface PublicDish {
  id: string;
  name: string;
  price: number;
}

interface CreateOrderResponse {
  order: {
    id: string;
    orderNumber: number;
    status: string;
    createdAt: string;
  };
}

export interface ClientCreateOrderInput {
  runId: string;
  restaurantId: string;
  participantKey: string;
  simulatedNow: Date;
  correlationId: string;
  sequence: number;
  dishName: string;
  quantity: number;
  couponCode?: string;
  paymentMethod?: 'cash' | 'mercadopago';
}

@Injectable()
export class ClientParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async createOrder(
    input: ClientCreateOrderInput,
  ): Promise<CreateOrderResponse> {
    const dishesResponse = await this.http.request<
      PublicDish[] | { dishes: PublicDish[] }
    >({
      path: `/api/restaurants/${input.restaurantId}/dishes/public`,
      method: 'GET',
      runId: input.runId,
      participantKey: input.participantKey,
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: `${input.correlationId}:menu`,
    });
    const dishes = Array.isArray(dishesResponse)
      ? dishesResponse
      : dishesResponse.dishes;
    const dish = dishes.find((candidate) => candidate.name === input.dishName);
    if (!dish) {
      throw new Error(`El menú real no contiene ${input.dishName}`);
    }

    return this.http.request<CreateOrderResponse>({
      path: `/api/restaurants/${input.restaurantId}/orders`,
      method: 'POST',
      runId: input.runId,
      participantKey: input.participantKey,
      origin: 'SIMULATED',
      simulatedNow: input.simulatedNow,
      correlationId: input.correlationId,
      body: {
        customerName: `Cliente simulado ${input.sequence}`,
        customerEmail: `cliente-${input.sequence}@lab.bentoo.invalid`,
        customerPhone: `000000${String(input.sequence).padStart(4, '0')}`,
        type: 'PICKUP',
        paymentMethod: input.paymentMethod ?? 'cash',
        ...(input.couponCode ? { couponCode: input.couponCode } : {}),
        items: [
          {
            dishId: dish.id,
            quantity: input.quantity,
            unitPrice: dish.price,
          },
        ],
      },
    });
  }
}
