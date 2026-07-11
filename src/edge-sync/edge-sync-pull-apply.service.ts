import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ComandaItemStatus,
  Prisma,
  SyncOutboxStatus,
  TableSessionStatus,
  TableShape,
  TableStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EdgePullStreamPayload {
  items: unknown[];
  cursor: string;
  since?: string | null;
}

export type EdgePullStreams = Record<string, EdgePullStreamPayload>;

@Injectable()
export class EdgeSyncPullApplyService {
  private readonly logger = new Logger(EdgeSyncPullApplyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyStreams(
    restaurantId: string,
    streams: EdgePullStreams,
  ): Promise<{ applied: string[] }> {
    const applied: string[] = [];

    if (streams.menu?.items?.length) {
      await this.applyMenu(restaurantId, streams.menu.items);
      applied.push('menu');
    }

    if (streams.tables?.items?.length) {
      await this.applyTables(restaurantId, streams.tables.items);
      applied.push('tables');
    }

    if (streams.settings?.items?.length) {
      await this.applySettings(restaurantId, streams.settings.items[0]);
      applied.push('settings');
    }

    if (streams.floor_sessions?.items?.length) {
      await this.applyFloorSessions(restaurantId, streams.floor_sessions.items);
      applied.push('floor_sessions');
    }

    return { applied };
  }

  async saveCursors(
    restaurantId: string,
    streams: EdgePullStreams,
  ): Promise<void> {
    for (const [streamKey, stream] of Object.entries(streams)) {
      if (!stream?.cursor) continue;
      await this.prisma.syncLocalCursor.upsert({
        where: {
          restaurantId_streamKey: { restaurantId, streamKey },
        },
        create: {
          restaurantId,
          streamKey,
          cursorValue: stream.cursor,
        },
        update: {
          cursorValue: stream.cursor,
        },
      });
    }
  }

  async getCursorMap(restaurantId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.syncLocalCursor.findMany({
      where: { restaurantId },
    });
    return Object.fromEntries(
      rows.map((row) => [row.streamKey, row.cursorValue]),
    );
  }

  private async applyMenu(restaurantId: string, items: unknown[]) {
    for (const rawCategory of items) {
      if (!rawCategory || typeof rawCategory !== 'object') continue;
      const category = rawCategory as {
        id?: string;
        name?: string;
        order?: number;
        dishes?: Array<{
          id?: string;
          name?: string;
          price?: number;
          isAvailable?: boolean;
          isAvailableInSalon?: boolean;
        }>;
      };

      if (!category.id || !category.name) continue;

      await this.prisma.category.upsert({
        where: { id: category.id },
        create: {
          id: category.id,
          restaurantId,
          name: category.name,
          order: category.order ?? 0,
        },
        update: {
          name: category.name,
          order: category.order ?? 0,
          deletedAt: null,
        },
      });

      for (const dish of category.dishes ?? []) {
        if (!dish.id || !dish.name || dish.price == null) continue;
        await this.prisma.dish.upsert({
          where: { id: dish.id },
          create: {
            id: dish.id,
            restaurantId,
            categoryId: category.id,
            name: dish.name,
            price: dish.price,
            isAvailable: dish.isAvailable ?? true,
            isAvailableInSalon: dish.isAvailableInSalon ?? true,
          },
          update: {
            categoryId: category.id,
            name: dish.name,
            price: dish.price,
            isAvailable: dish.isAvailable ?? true,
            isAvailableInSalon: dish.isAvailableInSalon ?? true,
            deletedAt: null,
          },
        });
      }
    }
  }

  private async applyTables(restaurantId: string, items: unknown[]) {
    for (const rawArea of items) {
      if (!rawArea || typeof rawArea !== 'object') continue;
      const area = rawArea as {
        id?: string;
        name?: string;
        tables?: Array<{
          id?: string;
          number?: string;
          capacity?: number;
          shape?: string;
          areaId?: string;
          positionX?: number;
          positionY?: number;
        }>;
      };

      if (!area.id || !area.name) continue;

      await this.prisma.tableArea.upsert({
        where: { id: area.id },
        create: {
          id: area.id,
          restaurantId,
          name: area.name,
        },
        update: {
          name: area.name,
        },
      });

      for (const table of area.tables ?? []) {
        if (!table.id || !table.number || table.capacity == null) continue;
        const shape = this.parseTableShape(table.shape);
        await this.prisma.table.upsert({
          where: { id: table.id },
          create: {
            id: table.id,
            restaurantId,
            number: String(table.number),
            capacity: table.capacity,
            areaId: table.areaId ?? area.id,
            shape,
            positionX: table.positionX ?? 0,
            positionY: table.positionY ?? 0,
            status: TableStatus.AVAILABLE,
          },
          update: {
            number: String(table.number),
            capacity: table.capacity,
            areaId: table.areaId ?? area.id,
            shape,
            positionX: table.positionX ?? 0,
            positionY: table.positionY ?? 0,
          },
        });
      }
    }
  }

  private async applySettings(restaurantId: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const settings = raw as {
      name?: string;
      slug?: string;
      businessRules?: Prisma.InputJsonValue;
    };

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...(settings.name ? { name: settings.name } : {}),
        ...(settings.slug ? { slug: settings.slug } : {}),
        ...(settings.businessRules !== undefined
          ? { businessRules: settings.businessRules }
          : {}),
      },
    });
  }

  private parseTableShape(raw?: string): TableShape {
    const normalized = (raw ?? 'SQUARE').toUpperCase();
    switch (normalized) {
      case 'ROUND':
        return TableShape.ROUND;
      case 'RECTANGLE':
        return TableShape.RECTANGLE;
      default:
        return TableShape.SQUARE;
    }
  }

  private async applyFloorSessions(restaurantId: string, items: unknown[]) {
    const cloudSessions = items
      .map((raw) => this.parseCloudFloorSession(raw))
      .filter((session): session is CloudFloorSession => session != null);

    const cloudIds = new Set(cloudSessions.map((session) => session.id));
    const protectedIds = await this.collectProtectedSessionIds(restaurantId);

    const localOpen = await this.prisma.tableSession.findMany({
      where: { restaurantId, status: TableSessionStatus.OPEN },
      select: { id: true },
    });

    for (const { id: localId } of localOpen) {
      if (protectedIds.has(localId)) continue;

      if (!cloudIds.has(localId)) {
        await this.removeLocalOpenSession(restaurantId, localId);
        continue;
      }

      const cloudSession = cloudSessions.find(
        (session) => session.id === localId,
      );
      if (!cloudSession) continue;

      await this.updateSessionFromCloud(restaurantId, localId, cloudSession);
      if (!protectedIds.has(localId)) {
        await this.syncSessionItemsFromCloud(localId, cloudSession);
      }
    }

    for (const cloudSession of cloudSessions) {
      const existing = await this.prisma.tableSession.findUnique({
        where: { id: cloudSession.id },
        select: { id: true, status: true },
      });

      if (existing) {
        if (existing.status === TableSessionStatus.CLOSED) continue;
        await this.updateSessionFromCloud(
          restaurantId,
          cloudSession.id,
          cloudSession,
        );
        if (!protectedIds.has(cloudSession.id)) {
          await this.syncSessionItemsFromCloud(cloudSession.id, cloudSession);
        }
        continue;
      }

      await this.insertSessionFromCloud(restaurantId, cloudSession);
      await this.syncSessionItemsFromCloud(cloudSession.id, cloudSession);
    }
  }

  private async collectProtectedSessionIds(
    restaurantId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.syncOutbox.findMany({
      where: {
        restaurantId,
        status: {
          in: [
            SyncOutboxStatus.PENDING,
            SyncOutboxStatus.FAILED,
            SyncOutboxStatus.SYNCING,
          ],
        },
      },
      select: { entityType: true, payload: true },
    });

    const protectedIds = new Set<string>();
    const pendingOpenTableIds: string[] = [];

    for (const row of rows) {
      const payload = this.asRecord(row.payload);
      const sessionId = this.optionalString(payload, 'sessionId');
      if (sessionId) protectedIds.add(sessionId);

      if (row.entityType !== 'OPEN_SESSION') continue;

      const body = this.asRecord(payload.body ?? payload);
      const tableId = this.optionalString(body, 'tableId');
      if (tableId) pendingOpenTableIds.push(tableId);
    }

    if (pendingOpenTableIds.length === 0) {
      return protectedIds;
    }

    const sessionsOnPendingTables = await this.prisma.tableSession.findMany({
      where: {
        restaurantId,
        status: TableSessionStatus.OPEN,
        tableId: { in: pendingOpenTableIds },
      },
      select: { id: true },
    });

    for (const session of sessionsOnPendingTables) {
      protectedIds.add(session.id);
    }

    return protectedIds;
  }

  private async removeLocalOpenSession(
    restaurantId: string,
    sessionId: string,
  ) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: { tableId: true },
    });
    if (!session) return;

    await this.prisma.$transaction([
      this.prisma.tableSessionItem.deleteMany({ where: { sessionId } }),
      this.prisma.tableSession.delete({ where: { id: sessionId } }),
      this.prisma.table.updateMany({
        where: { id: session.tableId, currentSessionId: sessionId },
        data: {
          status: TableStatus.AVAILABLE,
          currentSessionId: null,
        },
      }),
    ]);
  }

  private async updateSessionFromCloud(
    restaurantId: string,
    sessionId: string,
    cloudSession: CloudFloorSession,
  ) {
    await this.prisma.tableSession.updateMany({
      where: {
        id: sessionId,
        restaurantId,
        status: TableSessionStatus.OPEN,
      },
      data: {
        tableId: cloudSession.tableId,
        sessionNumber: cloudSession.sessionNumber,
        customerName: cloudSession.customerName,
        subtotal: cloudSession.subtotal,
        total: cloudSession.total,
        openedAt: cloudSession.openedAt,
        comandaRound: cloudSession.comandaRound,
        waiterName: cloudSession.waiterName,
      },
    });

    await this.prisma.table.updateMany({
      where: { id: cloudSession.tableId, restaurantId },
      data: {
        status: TableStatus.OCCUPIED,
        currentSessionId: sessionId,
      },
    });
  }

  private async insertSessionFromCloud(
    restaurantId: string,
    cloudSession: CloudFloorSession,
  ) {
    await this.prisma.tableSession.create({
      data: {
        id: cloudSession.id,
        restaurantId,
        tableId: cloudSession.tableId,
        sessionNumber: cloudSession.sessionNumber,
        status: TableSessionStatus.OPEN,
        customerName: cloudSession.customerName,
        subtotal: cloudSession.subtotal,
        total: cloudSession.total,
        openedAt: cloudSession.openedAt,
        comandaRound: cloudSession.comandaRound,
        waiterName: cloudSession.waiterName,
      },
    });

    await this.prisma.table.updateMany({
      where: { id: cloudSession.tableId, restaurantId },
      data: {
        status: TableStatus.OCCUPIED,
        currentSessionId: cloudSession.id,
      },
    });
  }

  private async syncSessionItemsFromCloud(
    sessionId: string,
    cloudSession: CloudFloorSession,
  ) {
    const dishIds = [
      ...new Set(cloudSession.items.map((item) => item.dishId).filter(Boolean)),
    ];
    const dishes =
      dishIds.length === 0
        ? []
        : await this.prisma.dish.findMany({
            where: { id: { in: dishIds } },
            select: { id: true, name: true },
          });
    const dishNames = new Map(dishes.map((dish) => [dish.id, dish.name]));

    await this.prisma.tableSessionItem.deleteMany({ where: { sessionId } });
    if (cloudSession.items.length === 0) return;

    await this.prisma.$transaction(
      cloudSession.items.map((item) =>
        this.prisma.tableSessionItem.create({
          data: {
            id: item.id ?? randomUUID(),
            sessionId,
            dishId: item.dishId,
            name: dishNames.get(item.dishId) ?? item.name ?? 'Ítem',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
            kitchenStatus: this.parseKitchenStatus(item.kitchenStatus),
            paidInOrderId: item.paidInOrderId,
          },
        }),
      ),
    );
  }

  private parseCloudFloorSession(raw: unknown): CloudFloorSession | null {
    if (!raw || typeof raw !== 'object') return null;
    const session = raw as Record<string, unknown>;
    const id = this.optionalString(session, 'id');
    const tableId = this.optionalString(session, 'tableId');
    const sessionNumber = this.optionalString(session, 'sessionNumber');
    if (!id || !tableId || !sessionNumber) return null;

    const status = (
      this.optionalString(session, 'status') ?? 'OPEN'
    ).toUpperCase();
    if (status !== TableSessionStatus.OPEN) return null;

    const itemsRaw = session.items;
    const items = Array.isArray(itemsRaw)
      ? itemsRaw
          .map((item) => this.parseCloudSessionItem(item))
          .filter((item): item is CloudFloorSessionItem => item != null)
      : [];

    return {
      id,
      tableId,
      sessionNumber,
      customerName: this.optionalString(session, 'customerName'),
      subtotal: this.optionalInt(session, 'subtotal') ?? 0,
      total: this.optionalInt(session, 'total') ?? 0,
      openedAt: this.parseDate(session.openedAt) ?? new Date(),
      comandaRound: this.optionalInt(session, 'comandaRound') ?? 0,
      waiterName: this.optionalString(session, 'waiterName'),
      items,
    };
  }

  private parseCloudSessionItem(raw: unknown): CloudFloorSessionItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const dishId = this.optionalString(item, 'dishId');
    if (!dishId) return null;

    return {
      id: this.optionalString(item, 'id') ?? undefined,
      dishId,
      name: this.optionalString(item, 'name'),
      quantity: this.optionalInt(item, 'quantity') ?? 1,
      unitPrice: this.optionalInt(item, 'unitPrice') ?? 0,
      subtotal: this.optionalInt(item, 'subtotal') ?? 0,
      notes: this.optionalString(item, 'notes'),
      kitchenStatus: this.optionalString(item, 'kitchenStatus'),
      paidInOrderId: this.optionalString(item, 'paidInOrderId'),
    };
  }

  private parseKitchenStatus(raw?: string): ComandaItemStatus {
    const normalized = (raw ?? 'PENDING').toUpperCase();
    switch (normalized) {
      case 'SENT':
        return ComandaItemStatus.SENT;
      case 'PREPARING':
        return ComandaItemStatus.PREPARING;
      case 'READY':
        return ComandaItemStatus.READY;
      case 'SERVED':
        return ComandaItemStatus.SERVED;
      case 'CANCELLED':
        return ComandaItemStatus.CANCELLED;
      default:
        return ComandaItemStatus.PENDING;
    }
  }

  private asRecord(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  private optionalString(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private optionalInt(
    source: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private parseDate(raw: unknown): Date | undefined {
    if (raw instanceof Date) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
  }
}

interface CloudFloorSessionItem {
  id?: string;
  dishId: string;
  name?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string;
  kitchenStatus?: string;
  paidInOrderId?: string;
}

interface CloudFloorSession {
  id: string;
  tableId: string;
  sessionNumber: string;
  customerName?: string;
  subtotal: number;
  total: number;
  openedAt: Date;
  comandaRound: number;
  waiterName?: string;
  items: CloudFloorSessionItem[];
}
