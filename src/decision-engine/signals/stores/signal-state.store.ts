import { Injectable } from '@nestjs/common';
import type { ProducedSignal } from '../types/signal.types';

export interface SignalStateStore {
  getActiveSignals(restaurantId: string): Promise<ProducedSignal[]>;
  saveSignals(restaurantId: string, signals: ProducedSignal[]): Promise<void>;
}

/**
 * In-memory signal state for R1. Replaced by Prisma persistence in R1-006.
 */
@Injectable()
export class InMemorySignalStateStore implements SignalStateStore {
  private readonly byRestaurant = new Map<string, ProducedSignal[]>();

  async getActiveSignals(restaurantId: string): Promise<ProducedSignal[]> {
    return [...(this.byRestaurant.get(restaurantId) ?? [])];
  }

  async saveSignals(
    restaurantId: string,
    signals: ProducedSignal[],
  ): Promise<void> {
    this.byRestaurant.set(restaurantId, signals);
  }

  clear(): void {
    this.byRestaurant.clear();
  }
}
