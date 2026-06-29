import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

@Injectable()
export class LoyaltyBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishPointsEarned(input: {
    restaurantId: string;
    accountId: string;
    customerEmail: string;
    customerName?: string;
    points: number;
    orderId?: string;
    newBalance: number;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.LoyaltyPointsEarned,
        restaurantId: input.restaurantId,
        source: input.source ?? 'loyalty',
        correlationId: input.orderId ?? input.accountId,
        payload: {
          accountId: input.accountId,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          points: input.points,
          orderId: input.orderId,
          newBalance: input.newBalance,
        },
      })
      .catch(() => undefined);
  }

  publishPointsRedeemed(input: {
    restaurantId: string;
    accountId: string;
    customerEmail: string;
    customerName?: string;
    points: number;
    orderId?: string;
    newBalance: number;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.LoyaltyPointsRedeemed,
        restaurantId: input.restaurantId,
        source: input.source ?? 'loyalty',
        correlationId: input.orderId ?? input.accountId,
        payload: {
          accountId: input.accountId,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          points: input.points,
          orderId: input.orderId,
          newBalance: input.newBalance,
        },
      })
      .catch(() => undefined);
  }

  publishTierUpgraded(input: {
    restaurantId: string;
    accountId: string;
    customerEmail: string;
    customerName?: string;
    previousTier: string;
    newTier: string;
    totalEarned: number;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.LoyaltyTierUpgraded,
        restaurantId: input.restaurantId,
        source: input.source ?? 'loyalty',
        correlationId: input.accountId,
        payload: {
          accountId: input.accountId,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          previousTier: input.previousTier,
          newTier: input.newTier,
          totalEarned: input.totalEarned,
        },
      })
      .catch(() => undefined);
  }
}
