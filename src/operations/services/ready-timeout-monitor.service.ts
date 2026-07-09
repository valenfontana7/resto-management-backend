import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CoordinationPriority,
  CoordinationType,
  OperationShiftStatus,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessEventPublisherService } from '../../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import { CoordinationService } from './coordination.service';
import { READY_TIMEOUT_MINUTES } from '../types/operations.types';

/**
 * Fase 0 pendiente: pedidos READY sin retirar → TASK a mozos.
 * No publica evento en cada transición a READY; solo al crear la coordinación.
 */
@Injectable()
export class ReadyTimeoutMonitorService {
  private readonly logger = new Logger(ReadyTimeoutMonitorService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinations: CoordinationService,
    private readonly businessEvents: BusinessEventPublisherService,
  ) {}

  @Cron('*/2 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scan();
    } catch (error) {
      this.logger.warn(
        `Ready timeout scan failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private async scan(): Promise<void> {
    const cutoff = new Date(Date.now() - READY_TIMEOUT_MINUTES * 60_000);

    const openShifts = await this.prisma.operationShift.findMany({
      where: {
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
      select: { id: true, restaurantId: true },
    });
    if (openShifts.length === 0) return;

    const restaurantIds = [...new Set(openShifts.map((s) => s.restaurantId))];
    const shiftByRestaurant = new Map(
      openShifts.map((s) => [s.restaurantId, s.id]),
    );

    const staleOrders = await this.prisma.order.findMany({
      where: {
        restaurantId: { in: restaurantIds },
        status: OrderStatus.READY,
        readyAt: { lte: cutoff, not: null },
      },
      select: {
        id: true,
        restaurantId: true,
        orderNumber: true,
        readyAt: true,
        type: true,
      },
      take: 100,
    });

    for (const order of staleOrders) {
      const shiftId = shiftByRestaurant.get(order.restaurantId);
      if (!shiftId || !order.readyAt) continue;

      const minutesReady = Math.round(
        (Date.now() - order.readyAt.getTime()) / 60_000,
      );
      const tableLabel = order.orderNumber;

      const result = await this.coordinations.createFromPolicy({
        restaurantId: order.restaurantId,
        shiftId,
        type: CoordinationType.TASK,
        priority: CoordinationPriority.HIGH,
        title: `Retirar comanda lista — ${tableLabel}`,
        description: `Listo hace ${minutesReady} min`,
        contextRef: {
          type: 'ORDER',
          id: order.id,
          label: tableLabel,
          deepLink: '/admin/salon',
        },
        origin: {
          kind: 'EVENT',
          sourceEventType: BentooBusinessEventType.OrderReadyStale,
        },
        participants: [
          {
            targetType: 'ROLE',
            targetId: 'WAITER',
            participantRole: 'ASSIGNEE',
            ackRequired: false,
          },
        ],
        policyDedupeKey: `policy:ready-stale:${shiftId}:${order.id}`,
        ackDeadlineMinutes: 10,
      });

      if (!result.deduped) {
        void this.businessEvents.publish({
          eventType: BentooBusinessEventType.OrderReadyStale,
          restaurantId: order.restaurantId,
          source: 'operations.ready-timeout',
          correlationId: `ready-stale:${order.id}`,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            readyAt: order.readyAt.toISOString(),
            minutesReady,
            tableLabel,
          },
        });
      }
    }
  }
}
