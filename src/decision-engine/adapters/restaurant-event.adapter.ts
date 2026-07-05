import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import {
  DecisionDomainEventType,
  normalizeDomainEvent,
  type DecisionDomainEvent,
} from '../signals/types/domain-event.types';
import { getRestaurantProductIntent } from '../../restaurants/onboarding-product-intent';

@Injectable()
export class RestaurantEventAdapterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Materializa hechos del dominio como DecisionDomainEvent[] para el Signal Engine.
   * No interpreta inteligencia — solo adapta estado persistido.
   */
  async loadDomainEvents(restaurantId: string): Promise<DecisionDomainEvent[]> {
    const now = new Date();
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        createdAt: true,
        isPublished: true,
        businessRules: true,
        _count: {
          select: {
            dishes: { where: { isAvailable: true } },
            orders: true,
          },
        },
        builderConfig: {
          select: { isPublished: true, updatedAt: true },
        },
        mercadoPagoCredential: {
          select: { restaurantId: true, updatedAt: true },
        },
        subscription: {
          select: {
            status: true,
            cancelAtPeriodEnd: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!restaurant) {
      return [];
    }

    const events: DecisionDomainEvent[] = [];
    const baseTs = restaurant.createdAt;

    events.push(
      normalizeDomainEvent({
        id: `${restaurantId}:restaurant.created`,
        restaurantId,
        type: DecisionDomainEventType.RestaurantCreated,
        payload: {},
        occurredAt: baseTs,
        source: 'restaurant-event-adapter',
      }),
    );

    const sitePublished =
      restaurant.isPublished || restaurant.builderConfig?.isPublished === true;

    if (sitePublished) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:site.published`,
          restaurantId,
          type: DecisionDomainEventType.SitePublished,
          payload: {},
          occurredAt: restaurant.builderConfig?.updatedAt ?? baseTs,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    if (restaurant._count.dishes > 0) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:menu.ready`,
          restaurantId,
          type: DecisionDomainEventType.MenuReady,
          payload: { activeDishes: restaurant._count.dishes },
          occurredAt: baseTs,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    if (restaurant.mercadoPagoCredential) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:payments.connected`,
          restaurantId,
          type: DecisionDomainEventType.PaymentsOnlineConnected,
          payload: {},
          occurredAt: restaurant.mercadoPagoCredential.updatedAt ?? baseTs,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    const paidOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        OR: [
          { orderSource: 'FLOOR_FINAL' },
          { status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED] } },
        ],
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    for (const order of paidOrders) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:order.paid:${order.id}`,
          restaurantId,
          type: DecisionDomainEventType.OrderPaid,
          payload: { orderId: order.id },
          occurredAt: order.createdAt,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    const sub = restaurant.subscription;
    if (sub?.cancelAtPeriodEnd || sub?.status === 'CANCELED') {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:subscription.cancel`,
          restaurantId,
          type: DecisionDomainEventType.SubscriptionCancelRequested,
          payload: { status: sub.status },
          occurredAt: sub.updatedAt ?? now,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    if (sub?.status === 'PAST_DUE') {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:subscription.payment_failed`,
          restaurantId,
          type: DecisionDomainEventType.SubscriptionPaymentFailed,
          payload: {},
          occurredAt: sub.updatedAt ?? now,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    const goliveComplete =
      sitePublished &&
      restaurant._count.dishes > 0 &&
      Boolean(restaurant.mercadoPagoCredential) &&
      paidOrders.length > 0;

    if (goliveComplete) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:golive.completed`,
          restaurantId,
          type: DecisionDomainEventType.GoliveCompleted,
          payload: {},
          occurredAt: paidOrders[0].createdAt,
          source: 'restaurant-event-adapter',
        }),
      );
    } else if (
      restaurant._count.dishes > 0 &&
      !sitePublished &&
      this.tenureDays(restaurant.createdAt, now) >= 7
    ) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:golive.stalled`,
          restaurantId,
          type: DecisionDomainEventType.GoliveStepStalled,
          payload: {},
          occurredAt: now,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    return events;
  }

  async loadEvaluationContext(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        createdAt: true,
        businessRules: true,
        subscription: { select: { status: true, trialEnd: true } },
      },
    });

    if (!restaurant) {
      return null;
    }

    const now = new Date();
    const tenureDays = this.tenureDays(restaurant.createdAt, now);
    const intent = getRestaurantProductIntent(restaurant.businessRules);

    let trialDay: number | null = null;
    if (restaurant.subscription?.trialEnd) {
      const trialStart = new Date(restaurant.subscription.trialEnd);
      trialStart.setDate(trialStart.getDate() - 14);
      trialDay = Math.max(1, this.tenureDays(trialStart, now));
    }

    return {
      restaurantId,
      evaluatedAt: now,
      intent,
      tenureDays,
      trialDay,
      lifecycleStage: restaurant.subscription?.status ?? 'unknown',
      modelVersion: '1.0.0',
      ruleCatalogVersion: '1.0.0',
    };
  }

  private tenureDays(from: Date, to: Date): number {
    return Math.max(
      0,
      Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }
}
