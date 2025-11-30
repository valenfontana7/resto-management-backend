import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderFiltersDto,
  OrderStatus,
} from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(restaurantId: string, createDto: CreateOrderDto) {
    // Validar que todos los dishes existan y pertenezcan al restaurante
    const dishIds = createDto.items.map((item) => item.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
        isAvailable: true,
      },
    });

    if (dishes.length !== dishIds.length) {
      throw new BadRequestException(
        'Some dishes are not available or do not exist',
      );
    }

    // Calcular totales
    const orderItems = createDto.items.map((item) => {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish) throw new BadRequestException(`Dish ${item.dishId} not found`);

      return {
        dishId: item.dishId,
        quantity: item.quantity,
        unitPrice: dish.price,
        subtotal: dish.price * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee = createDto.type === 'DELIVERY' ? 500 : 0; // 500 centavos = $5
    const tip = createDto.tip || 0;
    const total = subtotal + deliveryFee + tip;

    // Crear orden con items e historial inicial
    const order = await this.prisma.order.create({
      data: {
        restaurantId,
        customerName: createDto.customerName,
        customerEmail: createDto.customerEmail,
        customerPhone: createDto.customerPhone,
        type: createDto.type,
        status: OrderStatus.PENDING,
        paymentMethod: createDto.paymentMethod,
        paymentStatus: 'PENDING',
        subtotal,
        deliveryFee,
        tip,
        total,
        deliveryAddress: createDto.deliveryAddress,
        tableId: createDto.tableId,
        notes: createDto.notes,
        items: {
          create: orderItems,
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.PENDING,
            changedBy: 'system',
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
      },
    });

    return order;
  }

  async findAll(
    restaurantId: string,
    userId: string,
    filters: OrderFiltersDto,
  ) {
    // Verificar que el usuario pertenece al restaurante
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const where: any = {
      restaurantId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.customerPhone) {
      where.customerPhone = {
        contains: filters.customerPhone,
      };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        table: true,
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
    });
  }

  async findOne(id: string, restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        table: true,
        statusHistory: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async updateStatus(
    id: string,
    restaurantId: string,
    userId: string,
    updateDto: UpdateOrderStatusDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Validar transiciones de estado válidas
    this.validateStatusTransition(
      order.status as OrderStatus,
      updateDto.status,
    );

    // Actualizar orden y crear historial
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: updateDto.status,
        preparedAt:
          updateDto.status === OrderStatus.READY
            ? new Date()
            : order.preparedAt,
        deliveredAt:
          updateDto.status === OrderStatus.DELIVERED
            ? new Date()
            : order.deliveredAt,
        cancelledAt:
          updateDto.status === OrderStatus.CANCELLED
            ? new Date()
            : order.cancelledAt,
        statusHistory: {
          create: {
            fromStatus: order.status as OrderStatus,
            toStatus: updateDto.status,
            changedBy: userId,
            notes: updateDto.notes,
          },
        },
      },
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
    });

    return updatedOrder;
  }

  async getStats(restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, todayOrders, pendingOrders, revenue] =
      await Promise.all([
        this.prisma.order.count({
          where: { restaurantId },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            createdAt: { gte: today },
          },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            status: {
              in: [
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.PREPARING,
              ],
            },
          },
        }),
        this.prisma.order.aggregate({
          where: {
            restaurantId,
            status: { not: OrderStatus.CANCELLED },
          },
          _sum: {
            total: true,
          },
        }),
      ]);

    return {
      totalOrders,
      todayOrders,
      pendingOrders,
      revenue: revenue._sum.total || 0,
    };
  }

  async getTodayStats(restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Stats de hoy
    const [todayRevenue, todayOrders, todayReservations] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: today, lt: tomorrowStart },
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { total: true },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: today, lt: tomorrowStart },
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: { gte: today, lt: tomorrowStart },
          status: 'CONFIRMED',
        },
      }),
    ]);

    // Stats de ayer
    const [yesterdayRevenue, yesterdayOrders, yesterdayReservations] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            restaurantId,
            createdAt: { gte: yesterday, lt: today },
            status: { not: OrderStatus.CANCELLED },
          },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            createdAt: { gte: yesterday, lt: today },
            status: { not: OrderStatus.CANCELLED },
          },
        }),
        this.prisma.reservation.count({
          where: {
            restaurantId,
            date: { gte: yesterday, lt: today },
            status: 'CONFIRMED',
          },
        }),
      ]);

    const todayRev = todayRevenue._sum.total || 0;
    const yesterdayRev = yesterdayRevenue._sum.total || 0;
    const todayAvg = todayOrders > 0 ? todayRev / todayOrders : 0;
    const yesterdayAvg =
      yesterdayOrders > 0 ? yesterdayRev / yesterdayOrders : 0;

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      today: {
        revenue: todayRev,
        orders: todayOrders,
        averageOrder: Math.round(todayAvg),
        reservations: todayReservations,
      },
      yesterday: {
        revenue: yesterdayRev,
        orders: yesterdayOrders,
        averageOrder: Math.round(yesterdayAvg),
        reservations: yesterdayReservations,
      },
      percentageChange: {
        revenue: Number(calculateChange(todayRev, yesterdayRev).toFixed(1)),
        orders: Number(
          calculateChange(todayOrders, yesterdayOrders).toFixed(1),
        ),
        averageOrder: Number(
          calculateChange(todayAvg, yesterdayAvg).toFixed(1),
        ),
        reservations: Number(
          calculateChange(todayReservations, yesterdayReservations).toFixed(1),
        ),
      },
    };
  }

  async getTopDishes(restaurantId: string, userId: string, period: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Obtener items de órdenes agrupados por plato
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          createdAt: { gte: startDate },
          status: { not: OrderStatus.CANCELLED },
        },
      },
      include: {
        dish: {
          include: {
            category: true,
          },
        },
      },
    });

    // Agrupar y calcular totales
    const dishesMap = new Map<
      string,
      {
        dishId: string;
        dishName: string;
        categoryName: string;
        quantity: number;
        revenue: number;
      }
    >();

    orderItems.forEach((item) => {
      const existing = dishesMap.get(item.dishId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
      } else {
        dishesMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dish.name,
          categoryName: item.dish.category.name,
          quantity: item.quantity,
          revenue: item.subtotal,
        });
      }
    });

    // Convertir a array y ordenar por cantidad
    const topDishes = Array.from(dishesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Calcular porcentajes
    const totalRevenue = topDishes.reduce((sum, dish) => sum + dish.revenue, 0);

    return {
      topDishes: topDishes.map((dish) => ({
        ...dish,
        percentage:
          totalRevenue > 0
            ? Number(((dish.revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      })),
    };
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }
  }

  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
      [OrderStatus.READY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }
}
