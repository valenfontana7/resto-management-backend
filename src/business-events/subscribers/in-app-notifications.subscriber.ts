import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationPriority, NotificationType } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { formatOrderStatusLabel } from '../../common/utils/order-status-labels';
import { shouldReceiveRestaurantOrderAlerts } from '../../notifications/order-notification-channels.util';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessEventBusService } from '../business-event-bus.service';
import type { BentooBusinessEvent } from '../types/business-event.types';
import { BentooBusinessEventType } from '../types/event-type.enum';

/**
 * In-app notifications driven by business events — decouples cognitive alerts
 * from domain services (orders still emit operational kitchen/SSE notifications).
 */
@Injectable()
export class InAppNotificationsEventSubscriber implements OnModuleInit {
  readonly id = 'in-app-notifications';

  readonly eventTypes = [
    BentooBusinessEventType.PaymentFailed,
    BentooBusinessEventType.OrderDelayed,
    BentooBusinessEventType.ProductOutOfStock,
    BentooBusinessEventType.DeliveryAssigned,
    BentooBusinessEventType.ReservationCreated,
    BentooBusinessEventType.ReservationPendingConfirmation,
    BentooBusinessEventType.LoyaltyTierUpgraded,
  ] as const;

  private readonly logger = new Logger(InAppNotificationsEventSubscriber.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    if (event.isReplay) return;

    switch (event.eventType) {
      case BentooBusinessEventType.PaymentFailed:
        await this.notifyPaymentFailed(
          event as BentooBusinessEvent<BentooBusinessEventType.PaymentFailed>,
        );
        break;
      case BentooBusinessEventType.OrderDelayed:
        await this.notifyOrderDelayed(
          event as BentooBusinessEvent<BentooBusinessEventType.OrderDelayed>,
        );
        break;
      case BentooBusinessEventType.ProductOutOfStock:
        await this.notifyProductOutOfStock(
          event as BentooBusinessEvent<BentooBusinessEventType.ProductOutOfStock>,
        );
        break;
      case BentooBusinessEventType.DeliveryAssigned:
        await this.notifyDeliveryAssigned(
          event as BentooBusinessEvent<BentooBusinessEventType.DeliveryAssigned>,
        );
        break;
      case BentooBusinessEventType.ReservationCreated:
        await this.notifyReservationCreated(
          event as BentooBusinessEvent<BentooBusinessEventType.ReservationCreated>,
        );
        break;
      case BentooBusinessEventType.ReservationPendingConfirmation:
        await this.notifyReservationPendingConfirmation(
          event as BentooBusinessEvent<BentooBusinessEventType.ReservationPendingConfirmation>,
        );
        break;
      case BentooBusinessEventType.LoyaltyTierUpgraded:
        await this.notifyLoyaltyTierUpgraded(
          event as BentooBusinessEvent<BentooBusinessEventType.LoyaltyTierUpgraded>,
        );
        break;
      default:
        break;
    }
  }

  private async notifyPaymentFailed(
    event: BentooBusinessEvent<BentooBusinessEventType.PaymentFailed>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);
    const message = payload.reason
      ? `Un cobro de $${payload.amount} no se completó (${payload.reason}).`
      : `Un cobro online de $${payload.amount} no se completó.`;

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.PAYMENT_FAILED,
      title: 'Pago online fallido',
      message,
      priority: NotificationPriority.HIGH,
      data: {
        eventId: event.id,
        checkoutSessionId: payload.checkoutSessionId,
        orderId: payload.orderId,
        amount: payload.amount,
      },
    });
  }

  private async notifyOrderDelayed(
    event: BentooBusinessEvent<BentooBusinessEventType.OrderDelayed>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.CUSTOM,
      title: `Pedido demorado #${payload.orderNumber}`,
      message: `Lleva ${payload.delayMinutes} minutos en ${formatOrderStatusLabel(payload.status, { sentenceCase: false })}.`,
      priority: NotificationPriority.HIGH,
      data: {
        eventId: event.id,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    });
  }

  private async notifyProductOutOfStock(
    event: BentooBusinessEvent<BentooBusinessEventType.ProductOutOfStock>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.CUSTOM,
      title: `Sin stock — ${payload.dishName}`,
      message: 'Plato deshabilitado automáticamente por quiebre de insumos.',
      priority: NotificationPriority.NORMAL,
      data: {
        eventId: event.id,
        dishId: payload.dishId,
      },
    });
  }

  private async notifyDeliveryAssigned(
    event: BentooBusinessEvent<BentooBusinessEventType.DeliveryAssigned>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.CUSTOM,
      title: `Reparto asignado #${payload.orderNumber}`,
      message: `${payload.driverName} tiene el pedido en camino.`,
      priority: NotificationPriority.NORMAL,
      data: {
        eventId: event.id,
        orderId: payload.orderId,
        driverId: payload.driverId,
      },
    });
  }

  private async notifyReservationCreated(
    event: BentooBusinessEvent<BentooBusinessEventType.ReservationCreated>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.RESERVATION_CONFIRMED,
      title: 'Nueva reserva',
      message: `${payload.customerName} — ${payload.date} ${payload.time} (${payload.partySize} personas).`,
      priority: NotificationPriority.NORMAL,
      data: {
        eventId: event.id,
        reservationId: payload.reservationId,
      },
    });
  }

  private async notifyReservationPendingConfirmation(
    event: BentooBusinessEvent<BentooBusinessEventType.ReservationPendingConfirmation>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.CUSTOM,
      title: 'Confirmar reserva',
      message: `${payload.customerName} en ${payload.hoursUntilService}h — ${payload.time}.`,
      priority: NotificationPriority.HIGH,
      data: {
        eventId: event.id,
        reservationId: payload.reservationId,
      },
    });
  }

  private async notifyLoyaltyTierUpgraded(
    event: BentooBusinessEvent<BentooBusinessEventType.LoyaltyTierUpgraded>,
  ): Promise<void> {
    const payload = event.payload;
    const staff = await this.getRestaurantStaffUserIds(event.restaurantId);

    const label = payload.customerName ?? payload.customerEmail;
    await this.notifyStaff(staff, event.restaurantId, {
      type: NotificationType.CUSTOM,
      title: 'Cliente subió de nivel',
      message: `${label} pasó a ${payload.newTier}.`,
      priority: NotificationPriority.NORMAL,
      data: {
        eventId: event.id,
        accountId: payload.accountId,
      },
    });
  }

  private async notifyStaff(
    userIds: string[],
    restaurantId: string,
    input: {
      type: NotificationType;
      title: string;
      message: string;
      priority: NotificationPriority;
      data: Record<string, unknown>;
    },
  ): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.notifications.createAndSend({
          userId,
          restaurantId,
          type: input.type,
          title: input.title,
          message: input.message,
          priority: input.priority,
          data: input.data,
        });
      } catch (error) {
        this.logger.error(
          `Failed in-app notification for user ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async getRestaurantStaffUserIds(
    restaurantId: string,
  ): Promise<string[]> {
    const [memberships, directUsers] = await Promise.all([
      this.prisma.restaurantMembership.findMany({
        where: {
          restaurantId,
          user: { isActive: true },
        },
        select: {
          userId: true,
          isDefault: true,
          role: { select: { name: true } },
          user: {
            select: {
              id: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: {
          restaurantId,
          isActive: true,
        },
        select: {
          id: true,
          role: { select: { name: true } },
        },
      }),
    ]);

    const staff = new Set<string>();

    for (const membership of memberships) {
      const roleName =
        membership.role?.name ?? membership.user.role?.name ?? null;
      if (
        shouldReceiveRestaurantOrderAlerts({
          roleName,
          viaMembership: true,
          isDefaultMembership: membership.isDefault,
        })
      ) {
        staff.add(membership.userId);
      }
    }

    for (const user of directUsers) {
      const roleName = user.role?.name ?? null;
      if (
        shouldReceiveRestaurantOrderAlerts({
          roleName,
          viaMembership: false,
        })
      ) {
        staff.add(user.id);
      }
    }

    if (staff.size === 0) {
      for (const membership of memberships) {
        staff.add(membership.userId);
      }
    }

    return [...staff];
  }
}
