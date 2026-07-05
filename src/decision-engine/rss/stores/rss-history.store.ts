import { Injectable } from '@nestjs/common';
import type { RestaurantSuccessSnapshot } from '../types/restaurant-success-snapshot.types';

@Injectable()
export class InMemoryRssHistoryStore {
  private readonly byRestaurant = new Map<
    string,
    RestaurantSuccessSnapshot[]
  >();

  async append(snapshot: RestaurantSuccessSnapshot): Promise<void> {
    const list = this.byRestaurant.get(snapshot.restaurantId) ?? [];
    list.push(snapshot);
    this.byRestaurant.set(snapshot.restaurantId, list);
  }

  async getHistory(restaurantId: string): Promise<RestaurantSuccessSnapshot[]> {
    return [...(this.byRestaurant.get(restaurantId) ?? [])];
  }

  clear(): void {
    this.byRestaurant.clear();
  }
}
