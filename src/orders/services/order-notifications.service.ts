import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EmailService,
  OrderData,
  RestaurantData,
} from '../../email/email.service';
import {
  OrdersGateway,
  OrderUpdatePayload,
} from '../../websocket/orders.gateway';
import { KitchenNotificationsService } from '../../kitchen/kitchen-notifications.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { OrderStatus, OrderType } from '../dto/order.dto';

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly ordersGateway: OrdersGateway,
    private readonly kitchenNotifications: KitchenNotificationsService,
    private readonly notificationsService: NotificationsService,
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

  mapRestaurantToEmailData(restaurant: any): RestaurantData {
    return {
      id: restaurant.id,
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
    };
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

  sendStatusUpdateEmail(order: any, restaurant: any) {
    const orderData = this.mapOrderToEmailData(order);
    const restaurantData = this.mapRestaurantToEmailData(restaurant);

    this.emailService
      .sendStatusUpdate(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(`Failed to send status update email: ${err.message}`);
      });
  }

  sendOrderConfirmationEmails(order: any, restaurant: any) {
    const orderData = this.mapOrderToEmailData(order);
    const restaurantData = this.mapRestaurantToEmailData(restaurant);

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

  emitOrderUpdate(restaurantId: string, order: any) {
    const wsPayload = this.mapOrderToWebSocketPayload(order);
    this.ordersGateway.emitOrderUpdate(restaurantId, wsPayload);
  }

  emitPaymentConfirmed(restaurantId: string, order: any) {
    const wsPayload = this.mapOrderToWebSocketPayload(order);
    this.ordersGateway.emitPaymentConfirmed(restaurantId, wsPayload);
    this.ordersGateway.emitNewOrder(restaurantId, wsPayload);
  }

  async emitKitchenNotification(order: any, newStatus: OrderStatus) {
    let notificationType:
      | 'order_created'
      | 'order_updated'
      | 'order_cancelled'
      | 'order_ready';

    switch (newStatus) {
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
      const restaurantUsers = await this.prisma.user.findMany({
        where: {
          restaurantId: order.restaurantId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      let notificationType:
        | 'ORDER_CREATED'
        | 'ORDER_UPDATED'
        | 'ORDER_CANCELLED'
        | 'ORDER_READY';

      switch (newStatus) {
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
    } catch (error) {
      this.logger.error('Error enviando notificaciones de orden:', error);
    }
  }
}
