import { Injectable } from '@nestjs/common';
import type { ActiveRecommendationRecord } from '../types/recommendation.types';

/**
 * In-memory active recommendation state per restaurant (R1).
 */
@Injectable()
export class InMemoryRecommendationStateStore {
  private readonly byRestaurant = new Map<
    string,
    ActiveRecommendationRecord[]
  >();

  getActive(restaurantId: string): ActiveRecommendationRecord[] {
    return [...(this.byRestaurant.get(restaurantId) ?? [])];
  }

  setActive(
    restaurantId: string,
    recommendations: ActiveRecommendationRecord[],
  ): void {
    this.byRestaurant.set(restaurantId, [...recommendations]);
  }

  clear(restaurantId: string): void {
    this.byRestaurant.delete(restaurantId);
  }
}
