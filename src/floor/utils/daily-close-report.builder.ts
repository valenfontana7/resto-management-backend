import {
  CashRegisterSessionStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isSalonFloorOrder } from '../../orders/utils/order-channel.util';
import type { DailyCloseReport } from '../types/daily-close-report.types';
import { paidOrderWhere, unpaidOpenOrderWhere } from './daily-order-money.util';

function formatBusinessDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayBoundsUtc(businessDate: Date) {
  const dateKey = formatBusinessDate(businessDate);
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

function extractCloseReportTotal(closeReport: Prisma.JsonValue | null): number {
  if (
    !closeReport ||
    typeof closeReport !== 'object' ||
    Array.isArray(closeReport)
  ) {
    return 0;
  }
  const total = (closeReport as { totalRevenue?: unknown }).totalRevenue;
  return typeof total === 'number' ? total : 0;
}

export async function buildDailyCloseReport(
  prisma: PrismaService,
  params: {
    restaurantId: string;
    businessDate: Date;
    closedAt: Date;
    closedByName: string;
    notes?: string | null;
  },
): Promise<DailyCloseReport> {
  const { start, end } = dayBoundsUtc(params.businessDate);

  const [restaurant, partialSessions, paidOrders, unpaidAgg] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: params.restaurantId },
        select: { name: true },
      }),
      prisma.cashRegisterSession.findMany({
        where: {
          restaurantId: params.restaurantId,
          status: CashRegisterSessionStatus.CLOSED,
          closedAt: { gte: start, lte: end },
        },
        orderBy: { closedAt: 'asc' },
        include: { terminal: true },
      }),
      prisma.order.findMany({
        where: paidOrderWhere(params.restaurantId, start, end),
        orderBy: { createdAt: 'asc' },
        include: {
          table: { select: { number: true } },
        },
      }),
      prisma.order.aggregate({
        where: unpaidOpenOrderWhere(params.restaurantId, start, end),
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

  if (!restaurant) {
    throw new Error('Restaurante no encontrado');
  }

  const partialSessionRows = partialSessions.map((session) => ({
    sessionId: session.id,
    openedByName: session.openedByName,
    terminal: session.terminal?.name ?? null,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? params.closedAt.toISOString(),
    totalRevenue: extractCloseReportTotal(session.closeReport),
    countedCash: session.countedCash,
    difference: session.difference,
  }));

  const salesByMethodMap = new Map<string, { total: number; count: number }>();
  let salonRevenue = 0;
  let onlineRevenue = 0;

  const orderLines = paidOrders.map((order) => {
    const salon = isSalonFloorOrder(order);
    const channel = salon ? ('salon' as const) : ('online' as const);
    const customerLabel = salon
      ? order.table
        ? `Mesa ${order.table.number}`
        : order.customerName?.trim() || 'Salón'
      : order.customerName?.trim() || 'Cliente online';

    if (salon) salonRevenue += order.total;
    else onlineRevenue += order.total;

    const method = order.paymentMethod ?? 'unknown';
    const bucket = salesByMethodMap.get(method) ?? { total: 0, count: 0 };
    bucket.total += order.total;
    bucket.count += 1;
    salesByMethodMap.set(method, bucket);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel,
      customerLabel,
      amount: order.total,
      paymentMethod: method,
      paymentStatus: order.paymentStatus ?? PaymentStatus.PAID,
      createdAt: order.createdAt.toISOString(),
    };
  });

  const salesByMethod = [...salesByMethodMap.entries()]
    .map(([paymentMethod, stats]) => ({
      paymentMethod,
      total: stats.total,
      count: stats.count,
    }))
    .sort((a, b) => b.total - a.total);

  const totalRevenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const totalCountedCash = partialSessions.reduce(
    (sum, session) => sum + (session.countedCash ?? 0),
    0,
  );
  const totalExpectedCash = partialSessions.reduce(
    (sum, session) => sum + session.expectedCash,
    0,
  );
  const totalDifference = partialSessions.reduce(
    (sum, session) => sum + (session.difference ?? 0),
    0,
  );

  return {
    kind: 'DAILY',
    businessDate: formatBusinessDate(params.businessDate),
    restaurantName: restaurant.name,
    closedAt: params.closedAt.toISOString(),
    closedByName: params.closedByName,
    partialSessions: partialSessionRows,
    salesByMethod,
    channelBreakdown: {
      salon: salonRevenue,
      online: onlineRevenue,
    },
    totalRevenue,
    pendingRevenue: unpaidAgg._sum.total ?? 0,
    totalOrders: paidOrders.length,
    pendingOrders: unpaidAgg._count._all,
    orders: orderLines,
    partialCashSummary: {
      sessionCount: partialSessions.length,
      totalCountedCash,
      totalExpectedCash,
      totalDifference,
    },
    notes: params.notes ?? null,
  };
}

export { dayBoundsUtc, formatBusinessDate };
