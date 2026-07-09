import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CoordinationPriority,
  CoordinationType,
  OperationShiftStatus,
} from '@prisma/client';
import { BusinessEventBusService } from '../../business-events/business-event-bus.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import type {
  BentooBusinessEvent,
  BusinessEventSubscriber,
} from '../../business-events/types/business-event.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CoordinationService } from './coordination.service';
import type { ContextRef } from '../types/operations.types';

/**
 * Policies: BusinessEvent → Coordination (idempotent via policyDedupeKey).
 * Fase 0: ProductOutOfStock → HEADS_UP; InventoryLowStock → TASK.
 */
@Injectable()
export class CoordinationPolicyService
  implements OnModuleInit, BusinessEventSubscriber
{
  readonly id = 'operations-coordination-policies';
  readonly eventTypes = [
    BentooBusinessEventType.ProductOutOfStock,
    BentooBusinessEventType.InventoryLowStock,
  ] as const;

  private readonly logger = new Logger(CoordinationPolicyService.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly prisma: PrismaService,
    private readonly coordinations: CoordinationService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    try {
      if (event.eventType === BentooBusinessEventType.ProductOutOfStock) {
        await this.onProductOutOfStock(event);
      } else if (
        event.eventType === BentooBusinessEventType.InventoryLowStock
      ) {
        await this.onInventoryLowStock(event);
      }
    } catch (error) {
      this.logger.warn(
        `Policy failed for ${event.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async requireOpenShiftId(
    restaurantId: string,
  ): Promise<string | null> {
    const shift = await this.prisma.operationShift.findFirst({
      where: {
        restaurantId,
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
      orderBy: { openedAt: 'desc' },
    });
    return shift?.id ?? null;
  }

  private async onProductOutOfStock(event: BentooBusinessEvent): Promise<void> {
    const shiftId = await this.requireOpenShiftId(event.restaurantId);
    if (!shiftId) return;

    const payload = event.payload as { dishId?: string; dishName?: string };
    if (!payload.dishId) return;

    const contextRef: ContextRef = {
      type: 'DISH',
      id: payload.dishId,
      label: payload.dishName ?? payload.dishId,
      deepLink: '/admin/menu',
    };

    await this.coordinations.createFromPolicy({
      restaurantId: event.restaurantId,
      shiftId,
      type: CoordinationType.HEADS_UP,
      priority: CoordinationPriority.HIGH,
      title: `Sin ${payload.dishName ?? 'plato'}`,
      description: 'Plato agotado — confirmar recepción',
      contextRef,
      origin: {
        kind: 'EVENT',
        sourceEventType: event.eventType,
        sourceEventId: event.id,
      },
      participants: [
        {
          targetType: 'ROLE',
          targetId: 'WAITER',
          participantRole: 'WATCHER',
          ackRequired: true,
        },
      ],
      policyDedupeKey: `policy:86:${shiftId}:${payload.dishId}`,
    });
  }

  private async onInventoryLowStock(event: BentooBusinessEvent): Promise<void> {
    const shiftId = await this.requireOpenShiftId(event.restaurantId);
    if (!shiftId) return;

    const payload = event.payload as {
      inventoryItemId?: string;
      itemName?: string;
      currentStock?: number;
      minStock?: number;
    };
    const itemId = payload.inventoryItemId ?? 'unknown';
    const name = payload.itemName ?? 'insumo';

    const shift = await this.prisma.operationShift.findUnique({
      where: { id: shiftId },
    });
    const assignments = Array.isArray(shift?.assignments)
      ? (shift?.assignments as Array<{
          userId: string;
          responsibilities?: string[];
        }>)
      : [];
    const leadId =
      assignments.find((a) => a.responsibilities?.includes('SHIFT_LEAD'))
        ?.userId ?? null;

    const stockHint =
      payload.currentStock != null && payload.minStock != null
        ? `Stock ${payload.currentStock}/${payload.minStock}`
        : 'Stock crítico — reponer antes del rush';

    await this.coordinations.createFromPolicy({
      restaurantId: event.restaurantId,
      shiftId,
      type: CoordinationType.TASK,
      priority: CoordinationPriority.HIGH,
      title: `Reponer ${name}`,
      description: stockHint,
      contextRef: {
        type: 'INVENTORY_ITEM',
        id: itemId,
        label: name,
      },
      origin: {
        kind: 'INTELLIGENCE',
        sourceEventType: event.eventType,
        sourceEventId: event.id,
      },
      participants: [
        {
          targetType: leadId ? 'USER' : 'RESPONSIBILITY',
          targetId: leadId ?? 'SHIFT_LEAD',
          participantRole: 'ASSIGNEE',
          ackRequired: false,
        },
      ],
      policyDedupeKey: `policy:low-stock:${shiftId}:${itemId}`,
    });
  }
}
