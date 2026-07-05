import { Injectable } from '@nestjs/common';
import type { OpenOpportunityRecord } from '../types/opportunity.types';

/**
 * In-memory open opportunity state per restaurant (R1).
 * Production persistence is out of scope for this ticket.
 */
@Injectable()
export class InMemoryOpportunityStateStore {
  private readonly byRestaurant = new Map<string, OpenOpportunityRecord[]>();

  getOpen(restaurantId: string): OpenOpportunityRecord[] {
    return [...(this.byRestaurant.get(restaurantId) ?? [])];
  }

  setOpen(restaurantId: string, opportunities: OpenOpportunityRecord[]): void {
    this.byRestaurant.set(restaurantId, [...opportunities]);
  }

  clear(restaurantId: string): void {
    this.byRestaurant.delete(restaurantId);
  }
}
