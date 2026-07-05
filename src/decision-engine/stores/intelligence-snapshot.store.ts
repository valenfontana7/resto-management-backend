import { Injectable } from '@nestjs/common';
import type { RestaurantIntelligenceBundle } from '../types/restaurant-intelligence-bundle.v1';

@Injectable()
export class IntelligenceSnapshotStore {
  private readonly latest = new Map<string, RestaurantIntelligenceBundle>();

  get(restaurantId: string): RestaurantIntelligenceBundle | null {
    return this.latest.get(restaurantId) ?? null;
  }

  set(bundle: RestaurantIntelligenceBundle): void {
    this.latest.set(bundle.restaurantId, bundle);
  }

  getMany(restaurantIds: string[]): Map<string, RestaurantIntelligenceBundle> {
    const result = new Map<string, RestaurantIntelligenceBundle>();
    for (const id of restaurantIds) {
      const bundle = this.latest.get(id);
      if (bundle) result.set(id, bundle);
    }
    return result;
  }
}
