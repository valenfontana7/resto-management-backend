import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsPeriod } from './dto/analytics.dto';
import { OrderSource, OrderStatus } from '@prisma/client';
import {
  getCustomerRankingKey,
  getSalonTableRankingKey,
  isOnlineCustomerOrder,
} from '../orders/utils/order-channel.util';
import { LabBusinessDateService } from '../bentoo-lab/config/lab-business-date.service';

@Injectable()
export class AnalyticsService {
  private readonly timezone =
    process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly labBusinessDate?: LabBusinessDateService,
  ) {}

  async getVisitsCount(restaurantId: string, from?: Date, to?: Date) {
    const where: any = { restaurantId, metric: 'page_view' };
    if (from || to) where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;

    return this.prisma.analytics.count({ where });
  }

  /**
   * Get sales data over time
   */
  async getSales(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    // Usar query raw para agrupar por fecha en la DB en vez de cargar todo en memoria
    const tz = this.timezone;
    const rows = await this.prisma.$queryRaw<
      Array<{ date: string; sales: bigint | number; orders: bigint | number }>
    >`
      SELECT
        DATE(("createdAt" AT TIME ZONE ${tz})) AS "date",
        SUM("total") AS "sales",
        COUNT(*)::int AS "orders"
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "status" = 'DELIVERED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const salesData = rows.map((r) => {
      const sales = Number(r.sales);
      const orders = Number(r.orders);
      return {
        date:
          typeof r.date === 'string'
            ? r.date
            : new Date(r.date).toISOString().split('T')[0],
        sales,
        orders,
        avgTicket: orders > 0 ? Math.round(sales / orders) : 0,
      };
    });

    return { salesData };
  }

  async getAdminDashboard(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ) {
    const [
      sales,
      categories,
      hourly,
      customers,
      tables,
      performance,
      comparison,
      topDishes,
    ] = await Promise.all([
      this.getSales(restaurantId, period, startDate, endDate),
      this.getCategoryBreakdown(restaurantId, period, startDate, endDate),
      this.getHourlyData(restaurantId, period, startDate, endDate),
      this.getTopCustomers(restaurantId, period, 10, startDate, endDate),
      this.getTopTables(restaurantId, period, 10, startDate, endDate),
      this.getPerformance(restaurantId, period, startDate, endDate),
      this.getComparison(restaurantId, period, startDate, endDate),
      this.getTopDishes(restaurantId, period, 10, startDate, endDate),
    ]);

    return {
      salesData: sales.salesData,
      categoryBreakdown: categories.categoryBreakdown,
      hourlyData: hourly.hourlyData,
      topCustomers: customers.topCustomers,
      topTables: tables.topTables,
      topDishes: topDishes.topDishes,
      metrics: performance.metrics,
      comparison: comparison.comparison,
    };
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
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        category: string;
        sales: bigint | number;
        orders: bigint | number;
      }>
    >`
      SELECT
        COALESCE(c."name", 'Sin categoría') AS "category",
        COALESCE(SUM(oi."subtotal"), 0) AS "sales",
        COALESCE(SUM(oi."quantity"), 0)::int AS "orders"
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN "Dish" d ON d."id" = oi."dishId"
      LEFT JOIN "Category" c ON c."id" = d."categoryId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o."status" = 'DELIVERED'
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
      GROUP BY c."name"
      ORDER BY "sales" DESC
    `;

    const totalSales = rows.reduce((sum, row) => sum + Number(row.sales), 0);

    const categoryBreakdown = rows.map((row) => {
      const sales = Number(row.sales);
      return {
        category: row.category,
        sales,
        orders: Number(row.orders),
        percentage:
          totalSales > 0
            ? parseFloat(((sales / totalSales) * 100).toFixed(1))
            : 0,
      };
    });

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
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    const tz = this.timezone;
    const rows = await this.prisma.$queryRaw<
      Array<{ hour: number; orders: bigint | number; sales: bigint | number }>
    >`
      SELECT
        EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE ${tz}))::int AS "hour",
        COUNT(*)::int AS "orders",
        COALESCE(SUM("total"), 0) AS "sales"
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "status" != 'CANCELLED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const hourlyMap = new Map<number, { orders: number; sales: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { orders: 0, sales: 0 });
    }
    for (const r of rows) {
      hourlyMap.set(Number(r.hour), {
        orders: Number(r.orders),
        sales: Number(r.sales),
      });
    }

    const hourlyData = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour,
      orders: data.orders,
      sales: data.sales,
    }));

    return { hourlyData };
  }

  /**
   * Get top online customers (excludes salon / floor orders).
   */
  async getTopCustomers(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

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
        orderSource: true,
        tableSessionId: true,
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
      if (!isOnlineCustomerOrder(order)) return;

      const key = getCustomerRankingKey(order);
      if (!key) return;

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
   * Get top tables by revenue from salon (floor) payments.
   */
  async getTopTables(
    restaurantId: string,
    period: AnalyticsPeriod,
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        orderSource: OrderSource.FLOOR_FINAL,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        total: true,
        createdAt: true,
        tableId: true,
        tableSessionId: true,
        orderSource: true,
        customerName: true,
        table: {
          select: {
            number: true,
            area: {
              select: { name: true },
            },
          },
        },
      },
    });

    const tableMap = new Map<
      string,
      {
        tableId: string;
        tableNumber: string;
        area: string | null;
        orders: number;
        totalSpent: number;
        lastVisit: Date;
      }
    >();

    orders.forEach((order) => {
      const key = getSalonTableRankingKey(order);
      if (!key) return;

      if (!tableMap.has(key)) {
        const tableNumber = order.table?.number ?? key.slice(-6);
        const areaName = order.table?.area?.name ?? null;
        tableMap.set(key, {
          tableId: key,
          tableNumber,
          area: areaName,
          orders: 0,
          totalSpent: 0,
          lastVisit: order.createdAt,
        });
      }

      const table = tableMap.get(key)!;
      table.orders += 1;
      table.totalSpent += order.total;

      if (order.createdAt > table.lastVisit) {
        table.lastVisit = order.createdAt;
      }
    });

    const topTables = Array.from(tableMap.values())
      .map((table, index) => ({
        id: `table_${index + 1}`,
        tableId: table.tableId,
        tableNumber: table.tableNumber,
        area: table.area,
        label: table.area
          ? `Mesa ${table.tableNumber} · ${table.area}`
          : `Mesa ${table.tableNumber}`,
        orders: table.orders,
        totalSpent: table.totalSpent,
        avgTicket: Math.round(table.totalSpent / table.orders),
        lastVisit: table.lastVisit.toISOString(),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    return { topTables };
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
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

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
    const { start: currentStart, end: currentEnd } = await this.getDateRange(
      restaurantId,
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
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        dishId: string;
        dishName: string;
        categoryName: string | null;
        totalQty: bigint | number;
        totalRevenue: bigint | number;
      }>
    >`
      SELECT
        oi."dishId",
        d."name" AS "dishName",
        c."name" AS "categoryName",
        SUM(oi."quantity")::int AS "totalQty",
        COALESCE(SUM(oi."subtotal"), 0) AS "totalRevenue"
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN "Dish" d ON d."id" = oi."dishId"
      LEFT JOIN "Category" c ON c."id" = d."categoryId"
      WHERE o."restaurantId" = ${restaurantId}
        AND o."status" = 'DELIVERED'
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
      GROUP BY oi."dishId", d."name", c."name"
      ORDER BY "totalQty" DESC
      LIMIT ${limit}
    `;

    const topDishes = rows.map((r) => ({
      dishId: r.dishId,
      name: r.dishName || 'Plato eliminado',
      category: r.categoryName || 'Sin categoría',
      orders: Number(r.totalQty),
      revenue: Number(r.totalRevenue),
      avgRating: 4.5,
    }));

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
    const { start, end } = await this.getDateRange(
      restaurantId,
      period,
      startDate,
      endDate,
    );

    const typeLabels: Record<string, string> = {
      DINE_IN: 'Para comer aquí',
      PICKUP: 'Para llevar',
      DELIVERY: 'Delivery',
    };

    const channelLabels: Record<string, string> = {
      ONLINE: 'Pedidos online',
      FLOOR: 'Salón / mesas',
    };

    const rows = await this.prisma.$queryRaw<
      Array<{ type: string; orders: bigint | number; revenue: bigint | number }>
    >`
      SELECT
        "type",
        COUNT(*)::int AS "orders",
        COALESCE(SUM("total"), 0) AS "revenue"
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "status" = 'DELIVERED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY "type"
      ORDER BY "revenue" DESC
    `;

    const channelRows = await this.prisma.$queryRaw<
      Array<{
        channel: string;
        orders: bigint | number;
        revenue: bigint | number;
      }>
    >`
      SELECT
        CASE
          WHEN "orderSource" IN ('FLOOR_FINAL', 'FLOOR_COMANDA') THEN 'FLOOR'
          ELSE 'ONLINE'
        END AS "channel",
        COUNT(*)::int AS "orders",
        COALESCE(SUM("total"), 0) AS "revenue"
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "status" = 'DELIVERED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY 1
      ORDER BY "revenue" DESC
    `;

    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);

    const revenueBreakdown = rows.map((r) => {
      const revenue = Number(r.revenue);
      return {
        type: r.type,
        label: typeLabels[r.type] || r.type,
        orders: Number(r.orders),
        revenue,
        percentage:
          totalRevenue > 0
            ? parseFloat(((revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      };
    });

    const channelTotal = channelRows.reduce(
      (sum, r) => sum + Number(r.revenue),
      0,
    );

    const channelBreakdown = channelRows.map((r) => {
      const revenue = Number(r.revenue);
      return {
        channel: r.channel,
        label: channelLabels[r.channel] || r.channel,
        orders: Number(r.orders),
        revenue,
        percentage:
          channelTotal > 0
            ? parseFloat(((revenue / channelTotal) * 100).toFixed(1))
            : 0,
      };
    });

    return { revenueBreakdown, channelBreakdown };
  }

  /**
   * Helper: Get date range based on period.
   * En Lab, "hoy"/ventana relativa usan simulatedNow del run.
   */
  private async getDateRange(
    restaurantId: string,
    period: AnalyticsPeriod,
    startDate?: string,
    endDate?: string,
  ): Promise<{ start: Date; end: Date }> {
    const now = await this.resolveNowInTimeZone(restaurantId);
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
          throw new BadRequestException(
            'startDate and endDate required for custom period',
          );
        }
        start = this.getDateInTimeZone(startDate, false);
        end = this.getDateInTimeZone(endDate, true);
        break;

      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return { start, end };
  }

  private async resolveNowInTimeZone(restaurantId: string): Promise<Date> {
    const labNow =
      await this.labBusinessDate?.resolveSimulatedNow(restaurantId);
    if (labNow) {
      const local = labNow.toLocaleString('sv', {
        timeZone: this.timezone,
      });
      return new Date(local);
    }
    return this.getNowInTimeZone();
  }

  private getNowInTimeZone(): Date {
    const local = new Date().toLocaleString('sv', {
      timeZone: this.timezone,
    });
    return new Date(local);
  }

  private getDateInTimeZone(dateString: string, endOfDay: boolean): Date {
    const local = new Date(
      `${dateString}T${endOfDay ? '23:59:59.999' : '00:00:00'}`,
    ).toLocaleString('sv', {
      timeZone: this.timezone,
    });
    const date = new Date(local);
    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }

  /**
   * Helper: Get order statistics for a period
   */
  private async getOrderStats(
    restaurantId: string,
    start: Date,
    end: Date,
  ): Promise<{ sales: number; orders: number; avgTicket: number }> {
    const result = await this.prisma.order.aggregate({
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: { gte: start, lte: end },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    const sales = result._sum.total ?? 0;
    const count = result._count.id ?? 0;
    const avgTicket = count > 0 ? Math.round(sales / count) : 0;

    return { sales, orders: count, avgTicket };
  }
}
