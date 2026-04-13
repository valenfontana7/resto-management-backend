import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { OrderStatus } from '../dto/order.dto';

@Injectable()
export class OrderAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async getStats(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
                OrderStatus.PAID,
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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

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

    const topDishes = Array.from(dishesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

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
}
