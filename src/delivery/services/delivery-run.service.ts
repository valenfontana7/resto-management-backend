import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallMeBotService } from '../../notifications/callmebot.service';
import {
  DeliveryStatus,
  LinkDeliveryDriverDto,
  TestDriverWhatsappDto,
  UpdateDeliveryStatusDto,
  UpdateDriverLocationDto,
  UpdateDriverWhatsappDto,
} from '../dto/delivery.dto';
import { DeliveryDriversService } from './delivery-drivers.service';
import { normalizeRoleCode } from '../../common/utils/role.utils';
import { computeLiveDeliveryEta } from '../utils/delivery-eta.util';

const ACTIVE_RUN_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
];

@Injectable()
export class DeliveryRunService {
  private readonly logger = new Logger(DeliveryRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DeliveryDriversService,
    private readonly callMeBot: CallMeBotService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async getSession(restaurantId: string, userId: string) {
    const driver = await this.findLinkedDriver(restaurantId, userId);

    if (!driver) {
      const availableDrivers = await this.prisma.deliveryDriver.findMany({
        where: { restaurantId, isActive: true, userId: null },
        select: { id: true, name: true, phone: true, vehicle: true },
        orderBy: { name: 'asc' },
      });

      return {
        linked: false,
        driver: null,
        orders: [],
        availableDrivers,
      };
    }

    const orders = await this.loadActiveOrders(restaurantId, driver.id);

    return {
      linked: true,
      driver: this.mapRunDriver(driver),
      orders,
      availableDrivers: [],
    };
  }

  async updateDriverWhatsapp(
    restaurantId: string,
    userId: string,
    dto: UpdateDriverWhatsappDto,
  ) {
    const driver = await this.requireLinkedDriver(restaurantId, userId);

    const data: Prisma.DeliveryDriverUpdateInput = {};

    if (dto.apiKey !== undefined) {
      data.whatsappApiKey = dto.apiKey?.trim() || null;
    }

    if (dto.enabled !== undefined) {
      data.whatsappNotifyEnabled = dto.enabled;
    }

    await this.prisma.deliveryDriver.update({
      where: { id: driver.id },
      data,
    });

    return this.getSession(restaurantId, userId);
  }

  async testDriverWhatsapp(
    restaurantId: string,
    userId: string,
    dto: TestDriverWhatsappDto,
  ) {
    await this.requireLinkedDriver(restaurantId, userId);

    const ok = await this.callMeBot.sendMessage(
      dto.phone.trim(),
      dto.apiKey.trim(),
      '✅ Bentoo: tu WhatsApp de repartidor está activo. Vas a recibir avisos de envíos asignados.',
    );

    return { success: ok };
  }

  async linkDriver(
    restaurantId: string,
    userId: string,
    userRole: string | undefined,
    dto: LinkDeliveryDriverDto,
  ) {
    const role = normalizeRoleCode(userRole);
    const isPrivileged =
      role != null && ['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(role);

    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: dto.driverId, restaurantId, isActive: true },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    if (driver.userId && driver.userId !== userId && !isPrivileged) {
      throw new ForbiddenException(
        'Este repartidor ya está vinculado a otro usuario',
      );
    }

    const existingForUser = await this.prisma.deliveryDriver.findFirst({
      where: { restaurantId, userId, NOT: { id: driver.id } },
    });

    if (existingForUser) {
      throw new BadRequestException(
        'Ya tenés un perfil de repartidor vinculado',
      );
    }

    if (driver.userId !== userId) {
      await this.prisma.deliveryDriver.update({
        where: { id: driver.id },
        data: { userId },
      });
    }

    return this.getSession(restaurantId, userId);
  }

  async updateOrderStatus(
    restaurantId: string,
    userId: string,
    orderId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const driver = await this.requireLinkedDriver(restaurantId, userId);

    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: {
        orderId,
        order: { restaurantId },
        driverId: driver.id,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Pedido no encontrado o no asignado a vos');
    }

    this.validateDriverStatusTransition(delivery.status, dto.status);

    const updateData: Prisma.DeliveryOrderUpdateInput = {
      status: dto.status,
    };

    if (dto.status === DeliveryStatus.PICKED_UP && !delivery.pickedUpAt) {
      updateData.pickedUpAt = new Date();
    }

    if (dto.status === DeliveryStatus.IN_TRANSIT) {
      updateData.status = DeliveryStatus.IN_TRANSIT;
    }

    if (dto.status === DeliveryStatus.DELIVERED && !delivery.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    if (dto.notes) {
      updateData.driverNotes = dto.notes;
    }

    await this.prisma.deliveryOrder.update({
      where: { id: delivery.id },
      data: updateData,
    });

    if (dto.lat != null && dto.lng != null) {
      await this.driversService.updateDriverLocation(restaurantId, driver.id, {
        lat: dto.lat,
        lng: dto.lng,
      });
    }

    if (dto.status === DeliveryStatus.DELIVERED) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED' },
      });
    }

    const orders = await this.loadActiveOrders(restaurantId, driver.id);

    return { success: true, orders };
  }

  async updateLocation(
    restaurantId: string,
    userId: string,
    dto: UpdateDriverLocationDto,
  ) {
    const driver = await this.requireLinkedDriver(restaurantId, userId);
    return this.driversService.updateDriverLocation(
      restaurantId,
      driver.id,
      dto,
    );
  }

  async notifyAssignment(
    restaurantId: string,
    driverId: string,
    details: {
      orderId: string;
      orderNumber: string;
      deliveryAddress: string;
    },
  ): Promise<void> {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
      select: {
        userId: true,
        phone: true,
        whatsappNotifyEnabled: true,
        whatsappApiKey: true,
      },
    });

    if (!driver) {
      return;
    }

    if (driver.userId) {
      try {
        await this.notificationsService.createAndSend({
          userId: driver.userId,
          restaurantId,
          type: NotificationType.CUSTOM,
          title: 'Nuevo envío asignado',
          message: `${details.orderNumber} · ${details.deliveryAddress}`,
          priority: NotificationPriority.HIGH,
          channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
          data: {
            url: '/admin/delivery/mis-envios',
            orderId: details.orderId,
            driverId,
          },
        });
      } catch (error) {
        this.logger.warn(
          `No se pudo notificar asignación in-app al repartidor ${driverId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (
      driver.whatsappNotifyEnabled &&
      driver.phone?.trim() &&
      driver.whatsappApiKey?.trim()
    ) {
      const text =
        `🛵 Nuevo envío ${details.orderNumber}\n` +
        `📍 ${details.deliveryAddress}\n` +
        `Abrí Mis envíos en Bentoo.`;

      try {
        await this.callMeBot.sendMessage(
          driver.phone.trim(),
          driver.whatsappApiKey.trim(),
          text,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo enviar WhatsApp al repartidor ${driverId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private mapRunDriver(driver: {
    id: string;
    name: string;
    phone: string;
    vehicle: string | null;
    licensePlate: string | null;
    whatsappNotifyEnabled: boolean;
    whatsappApiKey: string | null;
  }) {
    return {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      vehicle: driver.vehicle,
      licensePlate: driver.licensePlate,
      whatsappNotifyEnabled: driver.whatsappNotifyEnabled,
      whatsappApiKey: driver.whatsappApiKey,
    };
  }

  private async requireLinkedDriver(restaurantId: string, userId: string) {
    const driver = await this.findLinkedDriver(restaurantId, userId);
    if (!driver) {
      throw new BadRequestException(
        'Vinculá tu perfil de repartidor antes de continuar',
      );
    }
    return driver;
  }

  private findLinkedDriver(restaurantId: string, userId: string) {
    return this.prisma.deliveryDriver.findFirst({
      where: { restaurantId, userId, isActive: true },
    });
  }

  private async loadActiveOrders(restaurantId: string, driverId: string) {
    const deliveries = await this.prisma.deliveryOrder.findMany({
      where: {
        driverId,
        order: { restaurantId },
        status: { in: ACTIVE_RUN_STATUSES },
      },
      include: {
        order: {
          include: {
            items: { include: { dish: true } },
          },
        },
        driver: {
          include: {
            locations: {
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
          },
        },
        zone: true,
      },
      orderBy: [{ status: 'asc' }, { assignedAt: 'asc' }, { createdAt: 'asc' }],
      take: 30,
    });

    return deliveries.map((delivery) => {
      const latestLocation = delivery.driver?.locations?.[0];
      const liveEta = computeLiveDeliveryEta({
        status: delivery.status,
        driverLat: latestLocation?.lat,
        driverLng: latestLocation?.lng,
        destinationLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        destinationLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        vehicle: delivery.driver?.vehicle,
        locationUpdatedAt: latestLocation?.timestamp,
      });

      return {
        id: delivery.id,
        orderNumber: `ORD-${delivery.order.id.slice(-8).toUpperCase()}`,
        orderId: delivery.orderId,
        customerName: delivery.order.customerName,
        customerPhone: delivery.order.customerPhone,
        deliveryAddress: delivery.deliveryAddress,
        deliveryLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        deliveryLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        items: delivery.order.items.map((item) => ({
          dishId: item.dishId,
          dishName: item.dish.name,
          quantity: item.quantity,
          price: item.dish.price,
          notes: item.notes,
        })),
        total: delivery.order.total,
        status: delivery.status,
        paymentMethod: delivery.order.paymentMethod,
        isPaid: delivery.order.paymentStatus === 'PAID',
        assignedAt: delivery.assignedAt,
        pickedUpAt: delivery.pickedUpAt,
        customerNotes: delivery.customerNotes,
        liveEtaMinutes: liveEta.liveEtaMinutes,
        distanceKmRemaining: liveEta.distanceKmRemaining,
      };
    });
  }

  private validateDriverStatusTransition(
    currentStatus: string,
    newStatus: DeliveryStatus,
  ) {
    const allowed: Record<string, DeliveryStatus[]> = {
      ASSIGNED: [DeliveryStatus.PICKED_UP],
      PICKED_UP: [DeliveryStatus.IN_TRANSIT],
      IN_TRANSIT: [DeliveryStatus.DELIVERED],
    };

    if (!allowed[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `No podés cambiar de ${currentStatus} a ${newStatus}`,
      );
    }
  }
}
