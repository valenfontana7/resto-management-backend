import { Injectable } from '@nestjs/common';
import { IntelligenceStateKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ProducedSignal } from '../types/signal.types';
import type { SignalStateStore } from './signal-state.store';

type PersistedSignal = Omit<ProducedSignal, 'detectedAt'> & {
  detectedAt: string;
};

/**
 * Persistencia Prisma del estado de señales activas entre corridas.
 * Reemplaza a InMemorySignalStateStore (R1) — sobrevive restarts.
 */
@Injectable()
export class PrismaSignalStateStore implements SignalStateStore {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveSignals(restaurantId: string): Promise<ProducedSignal[]> {
    const row = await this.prisma.restaurantIntelligenceState.findUnique({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.SIGNALS,
        },
      },
    });
    if (!row) return [];

    const signals = row.payload as unknown as PersistedSignal[];
    return signals.map((signal) => ({
      ...signal,
      detectedAt: new Date(signal.detectedAt),
    }));
  }

  async saveSignals(
    restaurantId: string,
    signals: ProducedSignal[],
  ): Promise<void> {
    const payload = signals.map((signal) => ({
      ...signal,
      detectedAt: signal.detectedAt.toISOString(),
    })) as unknown as Prisma.InputJsonValue;

    await this.prisma.restaurantIntelligenceState.upsert({
      where: {
        restaurantId_kind: {
          restaurantId,
          kind: IntelligenceStateKind.SIGNALS,
        },
      },
      create: {
        restaurantId,
        kind: IntelligenceStateKind.SIGNALS,
        payload,
      },
      update: { payload },
    });
  }
}
