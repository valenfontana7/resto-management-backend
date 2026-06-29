import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  OrderStatus,
  ReservationStatus,
  RestaurantStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessEventPublisherService } from './business-event-publisher.service';
import { BentooBusinessEventType } from './types/event-type.enum';

/** SLA alineado con el Insight Engine frontend (`OPERATIONAL_SLA.kitchenStuck`). */
const KITCHEN_DELAY_MINUTES = 20;
const DAILY_CLOSE_GRACE_HOUR = 1;
const CUSTOMER_INACTIVE_DAYS = 30;
const UNPUBLISHED_SITE_DAYS = 5;
const STALE_PUBLISHED_SITE_DAYS = 5;
const RESERVATION_CONFIRM_HOURS = 3;
const RESERVATION_NO_SHOW_GRACE_MINUTES = 15;

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
      this.scanUnpublishedSites(),
      this.scanStalePublishedSites(),
      this.scanPendingReservations(),
      this.scanReservationNoShowRisk(),
      this.scanLowStockInventory(),
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

  private async scanUnpublishedSites(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - UNPUBLISHED_SITE_DAYS);

    const candidates = await this.prisma.restaurant.findMany({
      where: {
        status: RestaurantStatus.ACTIVE,
        isPublished: false,
        createdAt: { lte: cutoff },
        dishes: {
          some: {
            deletedAt: null,
            isAvailable: true,
          },
        },
      },
      select: { id: true, name: true },
      take: 100,
    });

    for (const restaurant of candidates) {
      const builderConfig = await this.prisma.builderConfig.findUnique({
        where: { restaurantId: restaurant.id },
        select: { config: true, isPublished: true },
      });

      if (builderConfig?.isPublished) continue;

      const metadata = (
        builderConfig?.config as {
          metadata?: { firstPublishedAt?: string };
        } | null
      )?.metadata;
      if (metadata?.firstPublishedAt) continue;

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.MarketingSkipped,
          restaurantId: restaurant.id,
          source: 'business-event-monitor',
          correlationId: `site-unpublished:${restaurant.id}`,
          payload: {
            reason: 'site-not-published',
          },
        },
        7 * 24 * 60,
      );
    }
  }

  private async scanPendingReservations(): Promise<void> {
    const now = new Date();
    const businessDate = this.currentBusinessDate(now);
    const dateKey = businessDate.toISOString().slice(0, 10);

    const pending = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        date: businessDate,
        restaurant: { status: RestaurantStatus.ACTIVE },
      },
      select: {
        id: true,
        restaurantId: true,
        customerName: true,
        date: true,
        time: true,
        partySize: true,
      },
      take: 100,
    });

    for (const reservation of pending) {
      const serviceAt = new Date(`${dateKey}T${reservation.time}:00`);
      const hoursUntil = (serviceAt.getTime() - now.getTime()) / 3_600_000;

      if (hoursUntil < 0 || hoursUntil > RESERVATION_CONFIRM_HOURS) {
        continue;
      }

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.ReservationPendingConfirmation,
          restaurantId: reservation.restaurantId,
          source: 'business-event-monitor',
          correlationId: reservation.id,
          payload: {
            reservationId: reservation.id,
            customerName: reservation.customerName,
            date: dateKey,
            time: reservation.time,
            partySize: reservation.partySize,
            hoursUntilService: Math.max(0, Math.round(hoursUntil * 10) / 10),
          },
        },
        6 * 60,
      );
    }
  }

  private async scanStalePublishedSites(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_PUBLISHED_SITE_DAYS);

    const published = await this.prisma.builderConfig.findMany({
      where: {
        isPublished: true,
        updatedAt: { lte: cutoff },
        restaurant: { status: RestaurantStatus.ACTIVE },
      },
      select: {
        restaurantId: true,
        updatedAt: true,
        config: true,
      },
      take: 100,
    });

    for (const config of published) {
      const metadata = (
        config.config as {
          metadata?: { firstPublishedAt?: string; lastSocialPostAt?: string };
        } | null
      )?.metadata;
      const firstPublishedAt = metadata?.firstPublishedAt
        ? new Date(metadata.firstPublishedAt)
        : config.updatedAt;
      const daysSincePublish = Math.floor(
        (Date.now() - firstPublishedAt.getTime()) / 86_400_000,
      );
      const daysSinceUpdate = Math.floor(
        (Date.now() - config.updatedAt.getTime()) / 86_400_000,
      );

      if (daysSinceUpdate < STALE_PUBLISHED_SITE_DAYS) continue;

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.SiteStalePublished,
          restaurantId: config.restaurantId,
          source: 'business-event-monitor',
          correlationId: `site-stale:${config.restaurantId}`,
          payload: {
            daysSincePublish,
            daysSinceUpdate,
          },
        },
        3 * 24 * 60,
      );
    }
  }

  private async scanReservationNoShowRisk(): Promise<void> {
    const now = new Date();
    const businessDate = this.currentBusinessDate(now);
    const dateKey = businessDate.toISOString().slice(0, 10);

    const confirmed = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.CONFIRMED,
        date: businessDate,
        restaurant: { status: RestaurantStatus.ACTIVE },
      },
      select: {
        id: true,
        restaurantId: true,
        customerName: true,
        date: true,
        time: true,
        partySize: true,
      },
      take: 100,
    });

    for (const reservation of confirmed) {
      const serviceAt = new Date(`${dateKey}T${reservation.time}:00`);
      const minutesOverdue =
        (now.getTime() - serviceAt.getTime()) / 60_000 -
        RESERVATION_NO_SHOW_GRACE_MINUTES;

      if (minutesOverdue < 0) continue;

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.ReservationNoShowRisk,
          restaurantId: reservation.restaurantId,
          source: 'business-event-monitor',
          correlationId: reservation.id,
          payload: {
            reservationId: reservation.id,
            customerName: reservation.customerName,
            date: dateKey,
            time: reservation.time,
            partySize: reservation.partySize,
            minutesOverdue: Math.round(minutesOverdue),
          },
        },
        30,
      );
    }
  }

  private async scanLowStockInventory(): Promise<void> {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        currentStock: { gt: 0 },
        restaurant: { status: RestaurantStatus.ACTIVE },
      },
      select: {
        id: true,
        restaurantId: true,
        name: true,
        unit: true,
        currentStock: true,
        minStock: true,
        linkedDishIds: true,
      },
      take: 200,
    });

    const lowStock = items.filter((item) => item.currentStock <= item.minStock);

    if (lowStock.length === 0) return;

    const allDishIds = [
      ...new Set(lowStock.flatMap((item) => item.linkedDishIds)),
    ];
    const dishes =
      allDishIds.length > 0
        ? await this.prisma.dish.findMany({
            where: { id: { in: allDishIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        : [];
    const dishNameById = new Map(dishes.map((d) => [d.id, d.name]));

    for (const item of lowStock) {
      const affectedDishNames = item.linkedDishIds
        .map((id) => dishNameById.get(id))
        .filter((name): name is string => !!name);

      await this.publisher.publishDeduped(
        {
          eventType: BentooBusinessEventType.InventoryLowStock,
          restaurantId: item.restaurantId,
          source: 'business-event-monitor',
          correlationId: item.id,
          payload: {
            inventoryItemId: item.id,
            itemName: item.name,
            currentStock: item.currentStock,
            minStock: item.minStock,
            unit: item.unit,
            affectedDishIds: item.linkedDishIds,
            affectedDishNames,
          },
        },
        60,
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
