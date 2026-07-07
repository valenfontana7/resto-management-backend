import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import {
  DecisionDomainEventType,
  normalizeDomainEvent,
  type DecisionDomainEvent,
} from '../signals/types/domain-event.types';
import { getRestaurantProductIntent } from '../../restaurants/onboarding-product-intent';

/** Ventana del baseline de volumen (VolumeDropEvaluator / SIG-BIZ-03). */
const BASELINE_WINDOW_WEEKS = 8;

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
        memberships: {
          select: { id: true, createdAt: true },
        },
        terminals: {
          where: { isActive: true },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
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

    for (const membership of restaurant.memberships) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:user.invited:${membership.id}`,
          restaurantId,
          type: DecisionDomainEventType.UserInvited,
          payload: { membershipId: membership.id },
          occurredAt: membership.createdAt,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    const activeTerminal = restaurant.terminals[0];
    if (activeTerminal) {
      events.push(
        normalizeDomainEvent({
          id: `${restaurantId}:salon.desktop_ready`,
          restaurantId,
          type: DecisionDomainEventType.SalonDesktopReady,
          payload: { terminalId: activeTerminal.id },
          occurredAt: activeTerminal.createdAt,
          source: 'restaurant-event-adapter',
        }),
      );
    }

    const paidOrderWhere = {
      restaurantId,
      OR: [
        { orderSource: 'FLOOR_FINAL' as const },
        { status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED] } },
      ],
    };

    // Primer pedido pagado (hito) + ventana reciente completa para el baseline
    // de volumen (SIG-BIZ-03) y las reglas de inactividad. El viejo `take: 50`
    // ascendente dejaba fuera los pedidos recientes de restaurantes activos.
    const firstPaidOrder = await this.prisma.order.findFirst({
      where: paidOrderWhere,
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const baselineStart = new Date(
      now.getTime() - BASELINE_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000,
    );
    const recentPaidOrdersDesc = firstPaidOrder
      ? await this.prisma.order.findMany({
          where: { ...paidOrderWhere, createdAt: { gte: baselineStart } },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        })
      : [];
    const recentPaidOrders = [...recentPaidOrdersDesc].reverse();

    const includeFirstSeparately =
      firstPaidOrder && firstPaidOrder.createdAt < baselineStart;
    const paidOrders = includeFirstSeparately
      ? [firstPaidOrder, ...recentPaidOrders]
      : recentPaidOrders;

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
      baseline: { windowWeeks: BASELINE_WINDOW_WEEKS },
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
