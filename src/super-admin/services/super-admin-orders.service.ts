import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KitchenNotificationsService } from '../../kitchen/kitchen-notifications.service';
import * as crypto from 'crypto';

@Injectable()
export class SuperAdminOrdersService {
  private readonly logger = new Logger(SuperAdminOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenNotifications: KitchenNotificationsService,
  ) {}

  async getRestaurantOrders(
    restaurantId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {
      restaurantId,
    };

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              dish: true,
            },
          },
          statusHistory: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createManualOrder(
    restaurantId: string,
    createOrderDto: any,
    adminId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const dishIds = createOrderDto.items.map((item: any) => item.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
      },
    });

    if (dishes.length !== dishIds.length) {
      throw new BadRequestException(
        'Algunos platos no existen o no pertenecen al restaurante',
      );
    }

    const orderItems = createOrderDto.items.map((item: any) => {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish)
        throw new BadRequestException(`Plato ${item.dishId} no encontrado`);

      return {
        dishId: item.dishId,
        name: dish.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? dish.price,
        subtotal: (item.unitPrice ?? dish.price) * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal =
      createOrderDto.subtotal ??
      orderItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
    const deliveryFee = createOrderDto.deliveryFee ?? 0;
    const tip = createOrderDto.tip ?? 0;
    const total = createOrderDto.total ?? subtotal + deliveryFee + tip;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const ordersCount = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const orderNumber = `OD-${dateStr}-${String(ordersCount + 1).padStart(3, '0')}`;

    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        restaurantId,
        publicTrackingToken,
        customerName: createOrderDto.customerName,
        customerEmail: createOrderDto.customerEmail,
        customerPhone: createOrderDto.customerPhone,
        type: createOrderDto.type,
        status: 'CONFIRMED',
        paymentMethod: createOrderDto.paymentMethod ?? 'cash',
        paymentStatus: 'PAID',
        paidAt: new Date(),
        confirmedAt: new Date(),
        subtotal,
        deliveryFee,
        tip,
        total,
        deliveryAddress: createOrderDto.deliveryAddress,
        deliveryNotes: createOrderDto.deliveryNotes,
        tableId: createOrderDto.tableId,
        notes: createOrderDto.notes,
        items: {
          create: orderItems.map((item: any) => ({
            dishId: item.dishId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        },
        statusHistory: {
          create: {
            toStatus: 'CONFIRMED',
            changedBy: adminId,
            notes: 'Pedido creado y confirmado manualmente por SUPER_ADMIN',
          },
        },
      },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        statusHistory: true,
        restaurant: true,
      },
    });

    this.kitchenNotifications.emitNotification(order.restaurantId, {
      type: 'order_updated',
      orderId: order.id,
      data: {
        orderNumber: order.orderNumber,
        status: 'CONFIRMED',
        customerName: order.customerName,
        type: order.type,
        items: order.items.map((item) => ({
          name: item.dish.name,
          quantity: item.quantity,
          notes: item.notes,
        })),
        total: order.total,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CREATE_MANUAL_ORDER',
        targetRestaurantId: restaurantId,
        details: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
        },
      },
    });

    return {
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        createdAt: order.createdAt,
      },
    };
  }
}
