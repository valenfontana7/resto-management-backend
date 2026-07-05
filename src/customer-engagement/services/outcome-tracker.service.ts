import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EngagementPersistenceService } from '../stores/engagement-persistence.service';
import { ActiveJourneyService } from './active-journey.service';
import type {
  EngagementOutcomeRecord,
  EngagementOutcomeType,
  OutcomeRegistrationInput,
} from '../types/outcome.types';

@Injectable()
export class OutcomeTracker {
  constructor(
    private readonly persistence: EngagementPersistenceService,
    private readonly activeJourneys: ActiveJourneyService,
  ) {}

  async registerPending(deliveryId: string): Promise<void> {
    const delivery = await this.persistence.getDelivery(deliveryId);
    if (!delivery) return;

    await this.persistence.saveOutcome({
      id: randomUUID(),
      deliveryId,
      restaurantId: delivery.restaurantId,
      recommendationCode: delivery.recommendationCode,
      type: 'ignored',
      metadata: { phase: 'pending', note: 'Awaiting delivery outcome' },
    });
  }

  async register(
    input: OutcomeRegistrationInput,
  ): Promise<EngagementOutcomeRecord> {
    const delivery = await this.persistence.getDelivery(input.deliveryId);
    if (!delivery) {
      throw new NotFoundException(`Delivery ${input.deliveryId} not found`);
    }

    const rssBefore =
      typeof input.metadata?.rssBefore === 'number'
        ? input.metadata.rssBefore
        : null;
    const rssAfter = input.rssAfter ?? null;
    const rssDelta =
      rssBefore != null && rssAfter != null ? rssAfter - rssBefore : null;

    const record = await this.persistence.saveOutcome({
      id: randomUUID(),
      deliveryId: input.deliveryId,
      restaurantId: delivery.restaurantId,
      recommendationCode: delivery.recommendationCode,
      type: input.type,
      rssBefore,
      rssAfter,
      rssDelta,
      metadata: input.metadata ?? {},
    });

    if (input.type === 'goal_completed') {
      await this.activeJourneys.completeJourney(
        delivery.restaurantId,
        delivery.journeyId,
      );
    }

    return record;
  }

  async listForRestaurant(
    restaurantId: string,
  ): Promise<EngagementOutcomeRecord[]> {
    return this.persistence.listOutcomesForRestaurant(restaurantId);
  }

  async registerEmailEngagementEvent(input: {
    deliveryId: string;
    type: Extract<EngagementOutcomeType, 'opened' | 'clicked' | 'unsubscribed'>;
    source: string;
    providerEventType: string;
    providerMessageId: string | null;
  }): Promise<EngagementOutcomeRecord | null> {
    const delivery = await this.persistence.getDelivery(input.deliveryId);
    if (!delivery) return null;

    const existing = await this.persistence.listOutcomesForDelivery(
      input.deliveryId,
    );
    if (existing.some((row) => row.type === input.type)) {
      return null;
    }

    return this.persistence.saveOutcome({
      id: randomUUID(),
      deliveryId: input.deliveryId,
      restaurantId: delivery.restaurantId,
      recommendationCode: delivery.recommendationCode,
      type: input.type,
      metadata: {
        source: input.source,
        providerEventType: input.providerEventType,
        providerMessageId: input.providerMessageId,
      },
    });
  }
}
