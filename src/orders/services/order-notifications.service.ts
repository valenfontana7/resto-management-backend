import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EmailService,
  OrderData,
  RestaurantData,
} from '../../email/email.service';
import { ImageProcessingService } from '../../common/services/image-processing.service';
import { resolveRestaurantLogo } from '../../common/utils/restaurant-logo.util';
import {
  OrdersGateway,
  OrderUpdatePayload,
} from '../../websocket/orders.gateway';
import { KitchenNotificationsService } from '../../kitchen/kitchen-notifications.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallMeBotService } from '../../notifications/callmebot.service';
import { shouldReceiveRestaurantOrderAlerts } from '../../notifications/order-notification-channels.util';
import { OrderStatus, OrderType } from '../dto/order.dto';

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly images: ImageProcessingService,
    private readonly ordersGateway: OrdersGateway,
    @Inject(forwardRef(() => KitchenNotificationsService))
    private readonly kitchenNotifications: KitchenNotificationsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly callMeBot: CallMeBotService,
  ) {}

  mapOrderToEmailData(order: any): OrderData {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      type: order.type,
      status: order.status,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      tip: order.tip,
      total: order.total,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      publicTrackingToken: order.publicTrackingToken,
      items: order.items.map((item: any) => ({
        name: item.dish?.name || item.name || 'Item',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
      })),
    };
  }

  mapRestaurantToEmailData(restaurant: any): Promise<RestaurantData> {
    return this.buildRestaurantEmailData(restaurant);
  }

  private async buildRestaurantEmailData(
    restaurant: any,
  ): Promise<RestaurantData> {
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug ?? null,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
      logoUrl: await this.images.toEmailAssetUrl(
        resolveRestaurantLogo(restaurant),
      ),
    };
  }

  sendStatusUpdateEmail(order: any, restaurant: any) {
    void this.dispatchStatusUpdateEmail(order, restaurant);
  }

  private async dispatchStatusUpdateEmail(order: any, restaurant: any) {
    const orderData = this.mapOrderToEmailData(order);
    const restaurantData = await this.buildRestaurantEmailData(restaurant);

    this.emailService
      .sendStatusUpdate(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(`Failed to send status update email: ${err.message}`);
      });
  }

  sendOrderConfirmationEmails(order: any, restaurant: any) {
    void this.dispatchOrderConfirmationEmails(order, restaurant);
  }

  private async dispatchOrderConfirmationEmails(order: any, restaurant: any) {
    const orderData = this.mapOrderToEmailData(order);
    const restaurantData = await this.buildRestaurantEmailData(restaurant);

    this.emailService
      .sendOrderConfirmation(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(
          `Failed to send order confirmation email: ${err.message}`,
        );
      });

    this.emailService
      .sendNewOrderNotification(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(
          `Failed to send new order notification: ${err.message}`,
        );
      });
  }

  mapOrderToWebSocketPayload(order: any): OrderUpdatePayload {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: order.type,
      total: order.total,
      items: order.items.map((item: any) => ({
        name: item.dish?.name || item.name || 'Item',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  emitOrderUpdate(restaurantId: string, order: any) {
    const wsPayload = this.mapOrderToWebSocketPayload(order);
    this.ordersGateway.emitOrderUpdate(restaurantId, wsPayload);
  }

  emitPaymentConfirmed(restaurantId: string, order: any) {
    const wsPayload = this.mapOrderToWebSocketPayload(order);
    this.ordersGateway.emitPaymentConfirmed(restaurantId, wsPayload);
    this.ordersGateway.emitNewOrder(restaurantId, wsPayload);
  }

  emitNewOrderCreated(restaurantId: string, order: any) {
    const wsPayload = this.mapOrderToWebSocketPayload(order);
    this.ordersGateway.emitNewOrder(restaurantId, wsPayload);
  }

  async emitKitchenNotification(order: any, newStatus: OrderStatus) {
    let notificationType:
      | 'order_created'
      | 'order_updated'
      | 'order_cancelled'
      | 'order_ready';

    switch (newStatus) {
      case OrderStatus.PENDING:
      case OrderStatus.PAID:
      case OrderStatus.CONFIRMED:
        notificationType = 'order_created';
        break;
      case OrderStatus.PREPARING:
      case OrderStatus.READY:
        notificationType = 'order_updated';
        break;
      case OrderStatus.CANCELLED:
        notificationType = 'order_cancelled';
        break;
      default:
        return;
    }

    if (
      order.type === OrderType.DINE_IN ||
      order.type === OrderType.PICKUP ||
      order.type === OrderType.DELIVERY
    ) {
      this.kitchenNotifications.emitNotification(order.restaurantId, {
        type: notificationType,
        orderId: order.id,
        data: {
          orderNumber: order.orderNumber,
          status: newStatus,
          customerName: order.customerName,
          type: order.type,
          items:
            order.items?.map((item: any) => ({
              name: item.dish?.name || item.name || 'Item',
              quantity: item.quantity,
              notes: item.notes,
            })) || [],
          total: order.total,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });

      await this.sendOrderNotificationsToUsers(order, newStatus);
    }
  }

  private async sendOrderNotificationsToUsers(
    order: any,
    newStatus: OrderStatus,
  ) {
    try {
      const restaurantUsers = await this.getRestaurantStaffUsers(
        order.restaurantId,
      );

      let notificationType:
        | 'ORDER_CREATED'
        | 'ORDER_UPDATED'
        | 'ORDER_CANCELLED'
        | 'ORDER_READY';

      switch (newStatus) {
        case OrderStatus.PENDING:
        case OrderStatus.PAID:
        case OrderStatus.CONFIRMED:
          notificationType = 'ORDER_CREATED';
          break;
        case OrderStatus.PREPARING:
          notificationType = 'ORDER_UPDATED';
          break;
        case OrderStatus.READY:
          notificationType = 'ORDER_READY';
          break;
        case OrderStatus.CANCELLED:
          notificationType = 'ORDER_CANCELLED';
          break;
        default:
          return;
      }

      for (const user of restaurantUsers) {
        try {
          await this.notificationsService.createOrderNotification(
            user.id,
            order.restaurantId,
            order.id,
            notificationType,
            {
              orderNumber: order.orderNumber,
              status: newStatus,
              customerName: order.customerName,
              type: order.type,
              total: order.total,
            },
          );
        } catch (error) {
          this.logger.error(
            `Error enviando notificación a usuario ${user.id}:`,
            error,
          );
        }
      }

      if (notificationType === 'ORDER_CREATED') {
        void this.notifyOwnerWhatsapp(order);
      }
    } catch (error) {
      this.logger.error('Error enviando notificaciones de orden:', error);
    }
  }

  /**
   * Staff operativo del restaurante (memberships + legacy restaurantId).
   * Excluye SUPER_ADMIN y otros roles de plataforma.
   */
  private async getRestaurantStaffUsers(restaurantId: string) {
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

    const staff = new Map<string, { id: string; name: string | null }>();

    for (const membership of memberships) {
      const roleName =
        membership.role?.name ?? membership.user.role?.name ?? null;
      if (
        !shouldReceiveRestaurantOrderAlerts({
          roleName,
          viaMembership: true,
          isDefaultMembership: membership.isDefault,
        })
      ) {
        continue;
      }
      staff.set(membership.userId, {
        id: membership.userId,
        name: roleName,
      });
    }

    for (const user of directUsers) {
      const roleName = user.role?.name ?? null;
      if (
        !shouldReceiveRestaurantOrderAlerts({
          roleName,
          viaMembership: false,
        })
      ) {
        continue;
      }
      if (!staff.has(user.id)) {
        staff.set(user.id, { id: user.id, name: roleName });
      }
    }

    if (staff.size === 0) {
      this.logger.warn(
        `Sin destinatarios filtrados para restaurante ${restaurantId}; usando memberships activos como fallback`,
      );
      for (const membership of memberships) {
        staff.set(membership.userId, {
          id: membership.userId,
          name: membership.role?.name ?? membership.user.role?.name ?? null,
        });
      }
      for (const user of directUsers) {
        if (!staff.has(user.id)) {
          staff.set(user.id, { id: user.id, name: user.role?.name ?? null });
        }
      }
    }

    return [...staff.values()];
  }

  /**
   * Avisa al dueño por WhatsApp (CallMeBot) cuando llega un nuevo pedido,
   * siempre y cuando haya activado el canal y tenga apikey configurada.
   */
  private async notifyOwnerWhatsapp(order: any): Promise<void> {
    try {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: order.restaurantId },
        select: {
          ownerWhatsappEnabled: true,
          ownerWhatsappPhone: true,
          ownerWhatsappApiKey: true,
          name: true,
        },
      });

      if (
        !restaurant?.ownerWhatsappEnabled ||
        !restaurant.ownerWhatsappPhone ||
        !restaurant.ownerWhatsappApiKey
      ) {
        return;
      }

      const total = Number(order.total ?? 0).toLocaleString('es-AR');
      const customer = order.customerName || 'Cliente sin nombre';
      const text =
        `🍕 Nuevo pedido #${order.orderNumber} en ${restaurant.name}\n` +
        `Total: $${total} — ${customer}\n` +
        `Abrí el panel para aceptar.`;

      await this.callMeBot.sendMessage(
        restaurant.ownerWhatsappPhone,
        restaurant.ownerWhatsappApiKey,
        text,
      );
    } catch (err: any) {
      this.logger.warn(
        `No se pudo enviar WhatsApp al dueño (${order.restaurantId}): ${err?.message ?? err}`,
      );
    }
  }
}
