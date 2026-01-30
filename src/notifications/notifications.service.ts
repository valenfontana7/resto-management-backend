import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { KitchenNotificationsService } from '../kitchen/kitchen-notifications.service';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  Prisma,
} from '@prisma/client';

export interface CreateNotificationDto {
  userId: string;
  restaurantId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
}

export interface NotificationFilters {
  userId?: string;
  restaurantId?: string;
  isRead?: boolean;
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private kitchenNotifications: KitchenNotificationsService,
  ) {}

  /**
   * Crear y enviar una notificación
   */
  async createAndSend(dto: CreateNotificationDto): Promise<Notification> {
    // Crear la notificación en la base de datos
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        restaurantId: dto.restaurantId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        data: dto.data || {},
        priority: dto.priority || NotificationPriority.NORMAL,
        channels: dto.channels || [NotificationChannel.IN_APP],
      },
    });

    this.logger.log(
      `Notificación creada: ${notification.id} - ${notification.type}`,
    );

    // Enviar por los canales especificados
    await this.sendNotification(notification);

    return notification;
  }

  /**
   * Enviar notificación por los canales configurados
   */
  private async sendNotification(notification: Notification): Promise<void> {
    const channels = notification.channels;

    for (const channel of channels) {
      try {
        switch (channel) {
          case NotificationChannel.EMAIL:
            await this.sendEmailNotification(notification);
            break;
          case NotificationChannel.SSE:
            await this.sendSSENotification(notification);
            break;
          case NotificationChannel.IN_APP:
            // Ya está guardada en DB, no necesita envío adicional
            break;
          case NotificationChannel.PUSH:
            // TODO: Implementar push notifications
            this.logger.warn(
              `Push notifications no implementadas aún para notificación ${notification.id}`,
            );
            break;
        }
      } catch (error) {
        this.logger.error(
          `Error enviando notificación ${notification.id} por ${channel}:`,
          error,
        );
      }
    }
  }

  /**
   * Enviar notificación por email
   */
  private async sendEmailNotification(
    notification: Notification,
  ): Promise<void> {
    // Obtener el usuario
    const user = await this.prisma.user.findUnique({
      where: { id: notification.userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new Error(`Usuario no encontrado: ${notification.userId}`);
    }

    // Enviar email usando el método público
    await this.emailService.sendNotificationEmail(
      user.email,
      notification.title,
      notification.title,
      notification.message,
      notification.data,
    );

    this.logger.log(
      `Email enviado a ${user.email} para notificación ${notification.id}`,
    );
  }

  /**
   * Enviar notificación por SSE (si es para restaurante)
   */
  private async sendSSENotification(notification: Notification): Promise<void> {
    if (!notification.restaurantId) {
      return; // SSE solo para notificaciones de restaurante
    }

    // Convertir a formato SSE
    const sseData = {
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      timestamp: notification.createdAt,
    };

    // Usar el servicio de cocina para emitir (adaptar para notificaciones generales)
    // Por ahora, solo para tipos específicos
    if (notification.type.startsWith('ORDER_')) {
      // Ya se maneja en orders.service.ts
      return;
    }

    // Para otras notificaciones, podríamos crear un nuevo evento SSE
    // this.kitchenNotifications.emitNotification(notification.restaurantId, sseData);
  }

  /**
   * Obtener notificaciones de un usuario
   */
  async getUserNotifications(
    filters: NotificationFilters,
  ): Promise<Notification[]> {
    // Validar que userId esté presente
    if (!filters.userId) {
      this.logger.warn('getUserNotifications called without userId');
      return [];
    }

    const where: Prisma.NotificationWhereInput = {
      userId: filters.userId,
    };

    if (filters.restaurantId) {
      where.restaurantId = filters.restaurantId;
    }

    if (filters.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });
  }

  /**
   * Marcar notificación como leída
   */
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    return this.prisma.notification.update({
      where: {
        id: notificationId,
        userId, // Asegurar que el usuario solo pueda marcar sus propias notificaciones
      },
      data: { isRead: true },
    });
  }

  /**
   * Marcar todas las notificaciones de un usuario como leídas
   */
  async markAllAsRead(userId: string, restaurantId?: string): Promise<number> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      isRead: false,
    };

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return result.count;
  }

  /**
   * Obtener conteo de notificaciones no leídas
   */
  async getUnreadCount(userId: string, restaurantId?: string): Promise<number> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      isRead: false,
    };

    if (restaurantId) {
      where.restaurantId = restaurantId;
    }

    return this.prisma.notification.count({ where });
  }

  /**
   * Eliminar notificación
   */
  async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.notification.delete({
      where: {
        id: notificationId,
        userId, // Asegurar que el usuario solo pueda eliminar sus propias notificaciones
      },
    });
  }

  /**
   * Crear notificación para evento de orden (helper method)
   */
  async createOrderNotification(
    userId: string,
    restaurantId: string,
    orderId: string,
    type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_CANCELLED' | 'ORDER_READY',
    orderData: any,
  ): Promise<Notification> {
    const titles = {
      ORDER_CREATED: 'Nuevo pedido recibido',
      ORDER_UPDATED: 'Pedido actualizado',
      ORDER_CANCELLED: 'Pedido cancelado',
      ORDER_READY: 'Pedido listo',
    };

    const messages = {
      ORDER_CREATED: `Se ha recibido un nuevo pedido #${orderData.orderNumber}`,
      ORDER_UPDATED: `El pedido #${orderData.orderNumber} ha cambiado de estado`,
      ORDER_CANCELLED: `El pedido #${orderData.orderNumber} ha sido cancelado`,
      ORDER_READY: `El pedido #${orderData.orderNumber} está listo para recoger/entregar`,
    };

    return this.createAndSend({
      userId,
      restaurantId,
      type: type as NotificationType,
      title: titles[type],
      message: messages[type],
      data: orderData,
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    });
  }
}
