import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsPeriod } from './dto/analytics.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get sales data over time
   */
  async getSales(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        createdAt: true,
        total: true,
      },
    });

    const salesByDate = new Map<
      string,
      { sales: number; orders: number; avgTicket: number }
    >();

    orders.forEach((order) => {
      const dateKey = order.createdAt.toISOString().split('T')[0];

      if (!salesByDate.has(dateKey)) {
        salesByDate.set(dateKey, { sales: 0, orders: 0, avgTicket: 0 });
      }

      const data = salesByDate.get(dateKey)!;
      data.sales += order.total;
      data.orders += 1;
    });

    const salesData = Array.from(salesByDate.entries()).map(([date, data]) => ({
      date,
      sales: data.sales,
      orders: data.orders,
      avgTicket: data.orders > 0 ? Math.round(data.sales / data.orders) : 0,
    }));

    salesData.sort((a, b) => a.date.localeCompare(b.date));

    return { salesData };
  }

  /**
   * Get sales breakdown by category
   */
  async getCategoryBreakdown(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          status: OrderStatus.DELIVERED,
          createdAt: {
            gte: start,
            lte: end,
          },
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

    const categoryMap = new Map<
      string,
      { category: string; sales: number; orders: number }
    >();

    orderItems.forEach((item) => {
      const categoryName = item.dish?.category?.name || 'Sin categoría';

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          sales: 0,
          orders: 0,
        });
      }

      const data = categoryMap.get(categoryName)!;
      data.sales += item.subtotal;
      data.orders += item.quantity;
    });

    const totalSales = Array.from(categoryMap.values()).reduce(
      (sum, cat) => sum + cat.sales,
      0,
    );

    const categoryBreakdown = Array.from(categoryMap.values()).map((cat) => ({
      ...cat,
      percentage:
        totalSales > 0
          ? parseFloat(((cat.sales / totalSales) * 100).toFixed(1))
          : 0,
    }));

    categoryBreakdown.sort((a, b) => b.sales - a.sales);

    return { categoryBreakdown };
  }

  /**
   * Get hourly analysis
   */
  async getHourlyData(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        createdAt: true,
        total: true,
      },
    });

    const hourlyMap = new Map<number, { orders: number; sales: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { orders: 0, sales: 0 });
    }

    orders.forEach((order) => {
      const hour = order.createdAt.getHours();
      const data = hourlyMap.get(hour)!;
      data.orders += 1;
      data.sales += order.total;
    });

    const hourlyData = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      orders: data.orders,
      sales: data.sales,
    }));

    return { hourlyData };
  }

  /**
   * Get top customers
   */
  async getTopCustomers(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        total: true,
        createdAt: true,
      },
    });

    const customerMap = new Map<
      string,
      {
        name: string;
        email: string | null;
        phone: string;
        orders: number;
        totalSpent: number;
        lastVisit: Date;
      }
    >();

    orders.forEach((order) => {
      const key = order.customerPhone || order.customerName || 'Unknown';

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone,
          orders: 0,
          totalSpent: 0,
          lastVisit: order.createdAt,
        });
      }

      const customer = customerMap.get(key)!;
      customer.orders += 1;
      customer.totalSpent += order.total;

      if (order.createdAt > customer.lastVisit) {
        customer.lastVisit = order.createdAt;
      }
    });

    const topCustomers = Array.from(customerMap.values())
      .map((customer, index) => ({
        id: `customer_${index + 1}`,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        orders: customer.orders,
        totalSpent: customer.totalSpent,
        avgTicket: Math.round(customer.totalSpent / customer.orders),
        lastVisit: customer.lastVisit.toISOString(),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    return { topCustomers };
  }

  /**
   * Get performance metrics
   */
  async getPerformance(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        statusHistory: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    let totalPreparationTime = 0;
    let totalDeliveryTime = 0;
    let totalServiceTime = 0;
    let preparationCount = 0;
    let deliveryCount = 0;
    let serviceCount = 0;

    const totalOrders = orders.length;
    const completedOrders = orders.filter(
      (o) => o.status === OrderStatus.DELIVERED,
    ).length;

    orders.forEach((order) => {
      const history = order.statusHistory;

      const confirmed = history.find(
        (h) => h.toStatus === OrderStatus.CONFIRMED,
      );
      const preparing = history.find(
        (h) => h.toStatus === OrderStatus.PREPARING,
      );
      const ready = history.find((h) => h.toStatus === OrderStatus.READY);
      const delivered = history.find(
        (h) => h.toStatus === OrderStatus.DELIVERED,
      );

      if (confirmed && (preparing || ready)) {
        const endTime = preparing?.createdAt || ready?.createdAt;
        const minutes =
          (endTime!.getTime() - confirmed.createdAt.getTime()) / 1000 / 60;
        totalPreparationTime += minutes;
        preparationCount++;
      }

      if (ready && delivered) {
        const minutes =
          (delivered.createdAt.getTime() - ready.createdAt.getTime()) /
          1000 /
          60;
        totalDeliveryTime += minutes;
        deliveryCount++;
      }

      if (confirmed && delivered) {
        const minutes =
          (delivered.createdAt.getTime() - confirmed.createdAt.getTime()) /
          1000 /
          60;
        totalServiceTime += minutes;
        serviceCount++;
      }
    });

    const orderAccuracy =
      totalOrders > 0
        ? parseFloat(((completedOrders / totalOrders) * 100).toFixed(1))
        : 0;

    const customerSatisfaction =
      totalOrders > 0
        ? parseFloat(((completedOrders / totalOrders) * 5).toFixed(1))
        : 0;

    return {
      metrics: {
        avgPreparationTime:
          preparationCount > 0
            ? Math.round(totalPreparationTime / preparationCount)
            : 0,
        avgDeliveryTime:
          deliveryCount > 0 ? Math.round(totalDeliveryTime / deliveryCount) : 0,
        avgServiceTime:
          serviceCount > 0 ? Math.round(totalServiceTime / serviceCount) : 0,
        orderAccuracy,
        customerSatisfaction,
      },
    };
  }

  /**
   * Get comparison with previous period
   */
  async getComparison(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start: currentStart, end: currentEnd } = this.getDateRange(
      period,
      startDate,
      endDate,
    );

    const periodDays = Math.ceil(
      (currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const previousStart = new Date(
      currentStart.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );
    const previousEnd = new Date(currentStart.getTime() - 1);

    const currentOrders = await this.getOrderStats(
      restaurantId,
      currentStart,
      currentEnd,
    );

    const previousOrders = await this.getOrderStats(
      restaurantId,
      previousStart,
      previousEnd,
    );

    const salesGrowth =
      previousOrders.sales > 0
        ? parseFloat(
            (
              ((currentOrders.sales - previousOrders.sales) /
                previousOrders.sales) *
              100
            ).toFixed(1),
          )
        : 0;

    const ordersGrowth =
      previousOrders.orders > 0
        ? parseFloat(
            (
              ((currentOrders.orders - previousOrders.orders) /
                previousOrders.orders) *
              100
            ).toFixed(1),
          )
        : 0;

    const avgTicketGrowth =
      previousOrders.avgTicket > 0
        ? parseFloat(
            (
              ((currentOrders.avgTicket - previousOrders.avgTicket) /
                previousOrders.avgTicket) *
              100
            ).toFixed(1),
          )
        : 0;

    return {
      comparison: {
        current: currentOrders,
        previous: previousOrders,
        growth: {
          sales: salesGrowth,
          orders: ordersGrowth,
          avgTicket: avgTicketGrowth,
        },
      },
    };
  }

  /**
   * Get top dishes
   */
  async getTopDishes(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          status: OrderStatus.DELIVERED,
          createdAt: {
            gte: start,
            lte: end,
          },
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

    const dishMap = new Map<
      string,
      {
        dishId: string;
        name: string;
        category: string;
        orders: number;
        revenue: number;
      }
    >();

    orderItems.forEach((item) => {
      if (!item.dish) return;

      if (!dishMap.has(item.dishId)) {
        dishMap.set(item.dishId, {
          dishId: item.dishId,
          name: item.dish.name,
          category: item.dish.category?.name || 'Sin categoría',
          orders: 0,
          revenue: 0,
        });
      }

      const dish = dishMap.get(item.dishId)!;
      dish.orders += item.quantity;
      dish.revenue += item.subtotal;
    });

    const topDishes = Array.from(dishMap.values())
      .map((dish) => ({
        ...dish,
        avgRating: 4.5,
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, limit);

    return { topDishes };
  }

  /**
   * Get revenue breakdown by order type
   */
  async getRevenueBreakdown(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.getDateRange(period, startDate, endDate);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        type: true,
        total: true,
      },
    });

    const typeMap = new Map<
      string,
      { type: string; label: string; orders: number; revenue: number }
    >();

    const typeLabels: Record<string, string> = {
      DINE_IN: 'Para comer aquí',
      PICKUP: 'Para llevar',
      DELIVERY: 'Delivery',
    };

    orders.forEach((order) => {
      if (!typeMap.has(order.type)) {
        typeMap.set(order.type, {
          type: order.type,
          label: typeLabels[order.type] || order.type,
          orders: 0,
          revenue: 0,
        });
      }

      const data = typeMap.get(order.type)!;
      data.orders += 1;
      data.revenue += order.total;
    });

    const totalRevenue = Array.from(typeMap.values()).reduce(
      (sum, t) => sum + t.revenue,
      0,
    );

    const revenueBreakdown = Array.from(typeMap.values()).map((type) => ({
      ...type,
      percentage:
        totalRevenue > 0
          ? parseFloat(((type.revenue / totalRevenue) * 100).toFixed(1))
          : 0,
    }));

    revenueBreakdown.sort((a, b) => b.revenue - a.revenue);

    return { revenueBreakdown };
  }

  /**
   * Helper: Get date range based on period
   */
  private getDateRange(
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    switch (period) {
      case AnalyticsPeriod.TODAY:
        start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );
        break;

      case AnalyticsPeriod.WEEK:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        start.setHours(0, 0, 0, 0);
        break;

      case AnalyticsPeriod.MONTH:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;

      case AnalyticsPeriod.QUARTER: {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
        break;
      }

      case AnalyticsPeriod.YEAR:
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;

      case AnalyticsPeriod.ALL:
        start = new Date(2020, 0, 1, 0, 0, 0, 0);
        break;

      case AnalyticsPeriod.CUSTOM:
        if (!startDate || !endDate) {
          throw new Error('startDate and endDate required for custom period');
        }
        start = new Date(startDate);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        break;

      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return { start, end };
  }

  /**
   * Helper: Get order statistics for a period
   */
  private async getOrderStats(
    restaurantId: string,
    start: Date,
    end: Date,
  ): Promise<{ sales: number; orders: number; avgTicket: number }> {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        total: true,
      },
    });

    const sales = orders.reduce((sum, order) => sum + order.total, 0);
    const count = orders.length;
    const avgTicket = count > 0 ? Math.round(sales / count) : 0;

    return {
      sales,
      orders: count,
      avgTicket,
    };
  }
}
