import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus, RestaurantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessEventPublisherService } from './business-event-publisher.service';
import { BentooBusinessEventType } from './types/event-type.enum';

/** SLA alineado con el Insight Engine frontend (`OPERATIONAL_SLA.kitchenStuck`). */
const KITCHEN_DELAY_MINUTES = 20;
const DAILY_CLOSE_GRACE_HOUR = 1;
const CUSTOMER_INACTIVE_DAYS = 30;

@Injectable()
export class BusinessEventMonitorService {
  private readonly logger = new Logger(BusinessEventMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: BusinessEventPublisherService,
  ) {}

  @Cron('*/5 * * * *')
  async scanOperationalSignals(): Promise<void> {
    await Promise.all([
      this.scanDelayedOrders(),
      this.scanMissingDailyClosings(),
      this.scanInactiveCustomers(),
    ]);
  }

  private async scanDelayedOrders(): Promise<void> {
    const threshold = new Date(Date.now() - KITCHEN_DELAY_MINUTES * 60_000);

    const delayed = await this.prisma.order.findMany({
      where: {
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.PAID,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
          ],
        },
        createdAt: { lte: threshold },
        restaurant: { status: RestaurantStatus.ACTIVE },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        restaurantId: true,
        createdAt: true,
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of delayed) {
      const delayMinutes = Math.floor(
        (Date.now() - order.createdAt.getTime()) / 60_000,
      );

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.OrderDelayed,
          restaurantId: order.restaurantId,
          source: 'business-event-monitor',
          correlationId: order.id,
          payload: {
            orderId: order.id,
            orderNumber: String(order.orderNumber),
            delayMinutes,
            status: order.status,
          },
        },
        30,
      );
    }
  }

  private async scanMissingDailyClosings(): Promise<void> {
    const now = new Date();
    const localHour = this.resolveArgentinaHour(now);

    if (localHour < DAILY_CLOSE_GRACE_HOUR || localHour > 6) {
      return;
    }

    const businessDate = this.currentBusinessDate(now);
    const dateKey = businessDate.toISOString().slice(0, 10);
    const { start, end } = this.dayBoundsUtc(businessDate);

    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        status: RestaurantStatus.ACTIVE,
        orders: {
          some: {
            createdAt: { gte: start, lte: end },
            status: { not: OrderStatus.CANCELLED },
          },
        },
      },
      select: { id: true },
      take: 200,
    });

    for (const restaurant of restaurants) {
      const operation = await this.prisma.dailyOperation.findUnique({
        where: {
          restaurantId_businessDate: {
            restaurantId: restaurant.id,
            businessDate,
          },
        },
        select: { dailyClosedAt: true },
      });

      if (operation?.dailyClosedAt) continue;

      const hoursOverdue = Math.max(0, localHour - DAILY_CLOSE_GRACE_HOUR);

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.DailyClosingMissing,
          restaurantId: restaurant.id,
          source: 'business-event-monitor',
          correlationId: `daily-closing-missing:${dateKey}`,
          payload: {
            date: dateKey,
            hoursOverdue,
          },
        },
        12 * 60,
      );
    }
  }

  private async scanInactiveCustomers(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CUSTOMER_INACTIVE_DAYS);

    const recentOrders = await this.prisma.order.findMany({
      where: {
        customerProfileId: { not: null },
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: cutoff },
      },
      select: {
        restaurantId: true,
        customerProfileId: true,
      },
      distinct: ['restaurantId', 'customerProfileId'],
    });

    const activePairs = new Set(
      recentOrders.map(
        (order) => `${order.restaurantId}:${order.customerProfileId}`,
      ),
    );

    const staleProfiles = await this.prisma.restaurantCustomerProfile.findMany({
      where: {
        orders: {
          some: {
            status: { not: OrderStatus.CANCELLED },
            createdAt: { lt: cutoff },
          },
          none: {
            status: { not: OrderStatus.CANCELLED },
            createdAt: { gte: cutoff },
          },
        },
      },
      select: {
        id: true,
        restaurantId: true,
        displayName: true,
        orders: {
          where: { status: { not: OrderStatus.CANCELLED } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 100,
    });

    for (const profile of staleProfiles) {
      const pairKey = `${profile.restaurantId}:${profile.id}`;
      if (activePairs.has(pairKey)) continue;

      const lastOrderAt = profile.orders[0]?.createdAt;
      if (!lastOrderAt) continue;

      const daysInactive = Math.floor(
        (Date.now() - lastOrderAt.getTime()) / 86_400_000,
      );

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.CustomerInactive,
          restaurantId: profile.restaurantId,
          source: 'business-event-monitor',
          correlationId: profile.id,
          payload: {
            customerProfileId: profile.id,
            customerName: profile.displayName ?? 'Cliente',
            daysInactive,
          },
        },
        7 * 24 * 60,
      );
    }
  }

  private resolveArgentinaHour(now: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === 'hour')?.value;
    return Number.parseInt(hour ?? '0', 10);
  }

  private currentBusinessDate(now: Date): Date {
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(now);
    return new Date(`${dateKey}T12:00:00.000Z`);
  }

  private dayBoundsUtc(businessDate: Date) {
    const dateKey = businessDate.toISOString().slice(0, 10);
    return {
      start: new Date(`${dateKey}T00:00:00.000Z`),
      end: new Date(`${dateKey}T23:59:59.999Z`),
    };
  }
}
