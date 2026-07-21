import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessClockService } from '../../common/time/business-clock.service';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderStatus as DtoOrderStatus } from '../dto/order.dto';
import {
  extractOrderScheduleRules,
  resolveLeadMinutes,
} from '../utils/scheduled-order.util';

/**
 * Periodically releases held scheduled orders into the kitchen window
 * (scheduledFor - orderLeadTime <= now).
 */
@Injectable()
export class ScheduledOrdersReleaseService {
  private readonly logger = new Logger(ScheduledOrdersReleaseService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OrderNotificationsService,
    @Optional() private readonly businessClock?: BusinessClockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseDueOrders(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.releaseDueOrdersOnce();
    } catch (error) {
      this.logger.error(
        `Failed to release scheduled orders: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests. */
  async releaseDueOrdersOnce(): Promise<number> {
    const now = this.businessClock?.now() ?? new Date();
    // Candidate window: scheduled within next 24h or already past, not released
    const horizon = new Date(now.getTime() + 24 * 60 * 60_000);

    const candidates = await this.prisma.order.findMany({
      where: {
        kitchenReleasedAt: null,
        scheduledFor: { not: null, lte: horizon },
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.PAID,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
          ],
        },
        cancelledAt: null,
      },
      include: {
        items: {
          include: {
            dish: true,
            selectedModifiers: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            businessRules: true,
          },
        },
      },
      take: 100,
      orderBy: { scheduledFor: 'asc' },
    });

    let released = 0;

    for (const order of candidates) {
      if (!order.scheduledFor) continue;
      const leadMinutes = resolveLeadMinutes(
        extractOrderScheduleRules(order.restaurant.businessRules),
      );
      const releaseAt = new Date(
        order.scheduledFor.getTime() - leadMinutes * 60_000,
      );
      if (now.getTime() < releaseAt.getTime()) continue;

      const updated = await this.prisma.order.updateMany({
        where: { id: order.id, kitchenReleasedAt: null },
        data: { kitchenReleasedAt: now },
      });
      if (updated.count === 0) continue;

      released += 1;
      const payload = { ...order, kitchenReleasedAt: now };
      this.notifications.emitOrderUpdate(order.restaurantId, payload);
      void this.notifications.emitKitchenNotification(
        payload,
        (order.status as unknown as DtoOrderStatus) || DtoOrderStatus.CONFIRMED,
      );
    }

    if (released > 0) {
      this.logger.log(`Released ${released} scheduled order(s) to kitchen`);
    }

    return released;
  }
}
