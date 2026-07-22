import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

export interface GrowthParticipantContext {
  runId: string;
  restaurantId: string;
  simulatedNow: Date;
  correlationId: string;
}

@Injectable()
export class GrowthParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async validateCoupon(
    ctx: GrowthParticipantContext,
    input: { couponCode: string; orderAmount: number },
  ): Promise<{ valid: boolean; discountAmount: number; message?: string }> {
    return this.http.request({
      path: `/api/public/restaurants/${ctx.restaurantId}/coupons/validate`,
      method: 'POST',
      runId: ctx.runId,
      participantKey: 'client',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        code: input.couponCode,
        orderAmount: input.orderAmount,
      },
    });
  }

  async enrollLoyalty(
    ctx: GrowthParticipantContext,
    input: { email: string; name: string; phone?: string },
  ): Promise<{ id?: string; customerEmail?: string; points?: number }> {
    return this.http.request({
      path: `/api/restaurants/${ctx.restaurantId}/loyalty/enroll`,
      method: 'POST',
      runId: ctx.runId,
      participantKey: 'client',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        email: input.email,
        name: input.name,
        phone: input.phone,
      },
    });
  }

  async createReview(
    ctx: GrowthParticipantContext,
    input: {
      customerName: string;
      rating: number;
      comment?: string;
      customerEmail?: string;
    },
  ): Promise<{ id: string; rating?: number }> {
    return this.http.request({
      path: `/api/restaurants/${ctx.restaurantId}/reviews`,
      method: 'POST',
      runId: ctx.runId,
      participantKey: 'client',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        rating: input.rating,
        comment: input.comment,
      },
    });
  }

  async getPublishedBuilder(
    ctx: GrowthParticipantContext,
  ): Promise<Record<string, unknown> | null> {
    return this.http.request({
      path: `/api/public/restaurants/${ctx.restaurantId}/builder/config`,
      method: 'GET',
      runId: ctx.runId,
      participantKey: 'client',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
    });
  }
}
