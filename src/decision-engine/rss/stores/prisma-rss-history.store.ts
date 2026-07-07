import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RestaurantSuccessSnapshot } from '../types/restaurant-success-snapshot.types';

/** Ventana de lectura suficiente para deltas 7d/30d con margen. */
const HISTORY_WINDOW_DAYS = 45;
/** Retención dura del historial persistido. */
const HISTORY_RETENTION_DAYS = 90;

/**
 * Historial RSS persistido en Prisma (append-only).
 * Reemplaza a InMemoryRssHistoryStore (R1) — los deltas 7d/30d
 * sobreviven restarts del backend.
 */
@Injectable()
export class PrismaRssHistoryStore {
  constructor(private readonly prisma: PrismaService) {}

  async append(snapshot: RestaurantSuccessSnapshot): Promise<void> {
    await this.prisma.restaurantRssHistoryEntry.create({
      data: {
        restaurantId: snapshot.restaurantId,
        computedAt: new Date(snapshot.computedAt),
        value: snapshot.rss.value,
        band: snapshot.rss.band,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - HISTORY_RETENTION_DAYS);
    await this.prisma.restaurantRssHistoryEntry.deleteMany({
      where: {
        restaurantId: snapshot.restaurantId,
        computedAt: { lt: retentionCutoff },
      },
    });
  }

  async getHistory(restaurantId: string): Promise<RestaurantSuccessSnapshot[]> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - HISTORY_WINDOW_DAYS);

    const rows = await this.prisma.restaurantRssHistoryEntry.findMany({
      where: {
        restaurantId,
        computedAt: { gte: windowStart },
      },
      orderBy: { computedAt: 'asc' },
    });

    return rows.map(
      (row) => row.snapshot as unknown as RestaurantSuccessSnapshot,
    );
  }
}
