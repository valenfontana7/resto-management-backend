import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import type {
  LifecycleOutcomeRecord,
  LifecycleOutcomeType,
} from '../types/delivery.types';

export interface LifecycleOutcomeRegistrationInput {
  deliveryId: string;
  type: LifecycleOutcomeType;
  rssAfter?: number | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OutcomeCollector {
  constructor(private readonly persistence: LifecyclePersistenceService) {}

  async registerPending(deliveryId: string): Promise<void> {
    const delivery = await this.persistence.getDelivery(deliveryId);
    if (!delivery) return;

    await this.persistence.saveOutcome({
      id: randomUUID(),
      deliveryId,
      restaurantId: delivery.restaurantId,
      campaignId: delivery.campaignId,
      campaignType: delivery.campaignType,
      type: 'IGNORED',
      metadata: { phase: 'pending', note: 'Awaiting delivery outcome' },
    });
  }

  async register(
    input: LifecycleOutcomeRegistrationInput,
  ): Promise<LifecycleOutcomeRecord> {
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
      campaignId: delivery.campaignId,
      campaignType: delivery.campaignType,
      type: input.type,
      rssBefore,
      rssAfter,
      rssDelta,
      metadata: input.metadata ?? {},
    });

    if (input.type === 'GOAL_COMPLETED' || input.type === 'JOURNEY_COMPLETED') {
      await this.persistence.completeActiveCampaign(
        delivery.restaurantId,
        delivery.campaignId,
      );
    }

    return record;
  }

  async listForRestaurant(
    restaurantId: string,
  ): Promise<LifecycleOutcomeRecord[]> {
    return this.persistence.listOutcomesForRestaurant(restaurantId);
  }

  async registerEmailEvent(input: {
    deliveryId: string;
    type: Extract<LifecycleOutcomeType, 'OPENED' | 'CLICKED' | 'UNSUBSCRIBED'>;
    source: string;
    providerEventType: string;
    providerMessageId: string | null;
  }): Promise<LifecycleOutcomeRecord | null> {
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
      campaignId: delivery.campaignId,
      campaignType: delivery.campaignType,
      type: input.type,
      metadata: {
        source: input.source,
        providerEventType: input.providerEventType,
        providerMessageId: input.providerMessageId,
      },
    });
  }
}
