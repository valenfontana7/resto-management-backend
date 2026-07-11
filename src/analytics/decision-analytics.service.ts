import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

export type MenuEngineeringQuadrant = 'star' | 'puzzle' | 'plowhorse' | 'dog';

export interface MenuEngineeringItem {
  dishId: string;
  name: string;
  price: number;
  costPrice: number | null;
  marginPct: number | null;
  unitsSold: number;
  revenue: number;
  quadrant: MenuEngineeringQuadrant;
  suggestedAction: string;
}

export interface ChannelEconomicsRow {
  channel: string;
  channelLabel: string;
  orders: number;
  revenue: number;
  avgTicket: number;
  sharePct: number;
  estimatedCommissionPct: number;
  netRevenueEstimate: number;
}

@Injectable()
export class DecisionAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveChannelLabel(
    type: string,
    orderSource: string | null,
  ): string {
    const source = orderSource?.toUpperCase() ?? '';
    if (source === 'EXTERNAL') return 'Apps de delivery';
    if (source === 'ONLINE') return 'Canal propio';
    if (source === 'SALON_PHONE') return 'Pedido telefónico';
    if (source === 'FLOOR_COMANDA' || source === 'FLOOR_FINAL') return 'Salón';

    const normalizedType = type.toUpperCase();
    if (normalizedType === 'DELIVERY') return 'Envío propio';
    if (normalizedType === 'PICKUP') return 'Retiro en local';
    if (normalizedType === 'SALON' || normalizedType === 'DINE_IN')
      return 'Salón';

    return `${type}${orderSource ? ` · ${orderSource}` : ''}`
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  async getMenuEngineering(
    restaurantId: string,
    days = 30,
  ): Promise<MenuEngineeringItem[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const dishes = await this.prisma.dish.findMany({
      where: { restaurantId, deletedAt: null, isAvailable: true },
      select: {
        id: true,
        name: true,
        price: true,
        costPrice: true,
        orderItems: {
          where: {
            order: {
              restaurantId,
              status: OrderStatus.DELIVERED,
              createdAt: { gte: since },
            },
          },
          select: { quantity: true, subtotal: true },
        },
      },
    });

    const items = dishes.map((dish) => {
      const unitsSold = dish.orderItems.reduce((s, i) => s + i.quantity, 0);
      const revenue = dish.orderItems.reduce((s, i) => s + i.subtotal, 0);
      const marginPct =
        dish.costPrice != null && dish.price > 0
          ? Math.round(((dish.price - dish.costPrice) / dish.price) * 100)
          : null;

      return {
        dishId: dish.id,
        name: dish.name,
        price: dish.price,
        costPrice: dish.costPrice,
        marginPct,
        unitsSold,
        revenue,
        quadrant: 'dog' as MenuEngineeringQuadrant,
        suggestedAction: 'Revisar',
      };
    });

    if (items.length === 0) return [];

    const avgUnits =
      items.reduce((s, i) => s + i.unitsSold, 0) / items.length || 1;
    const margins = items
      .map((i) => i.marginPct)
      .filter((m): m is number => m != null);
    const avgMargin =
      margins.length > 0
        ? margins.reduce((s, m) => s + m, 0) / margins.length
        : 50;

    return items.map((item) => {
      const highPop = item.unitsSold >= avgUnits;
      const highMargin = (item.marginPct ?? 0) >= avgMargin;
      let quadrant: MenuEngineeringQuadrant = 'dog';
      let suggestedAction = 'Considerar sacar del menú';

      if (highPop && highMargin) {
        quadrant = 'star';
        suggestedAction = 'Promover — es estrella';
      } else if (highPop && !highMargin) {
        quadrant = 'plowhorse';
        suggestedAction = 'Subir precio o reducir costo';
      } else if (!highPop && highMargin) {
        quadrant = 'puzzle';
        suggestedAction = 'Mejorar visibilidad / descripción';
      }

      return { ...item, quadrant, suggestedAction };
    });
  }

  async getChannelEconomics(
    restaurantId: string,
    days = 30,
  ): Promise<ChannelEconomicsRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.groupBy({
      by: ['type', 'orderSource'],
      where: {
        restaurantId,
        status: OrderStatus.DELIVERED,
        createdAt: { gte: since },
      },
      _count: { id: true },
      _sum: { total: true },
    });

    const totalRevenue = orders.reduce((s, o) => s + (o._sum.total ?? 0), 0);

    const commissionMap: Record<string, number> = {
      ONLINE: 0,
      FLOOR_COMANDA: 0,
      FLOOR_FINAL: 0,
      SALON_PHONE: 0,
      EXTERNAL: 28,
    };

    return orders.map((row) => {
      const channel = `${row.type}:${row.orderSource ?? 'UNKNOWN'}`;
      const revenue = row._sum.total ?? 0;
      const ordersCount = row._count.id;
      const commissionPct =
        commissionMap[row.orderSource ?? ''] ??
        (row.type === 'DELIVERY' ? 15 : 0);
      const net = Math.round(revenue * (1 - commissionPct / 100));

      return {
        channel,
        channelLabel: this.resolveChannelLabel(row.type, row.orderSource),
        orders: ordersCount,
        revenue,
        avgTicket: ordersCount > 0 ? Math.round(revenue / ordersCount) : 0,
        sharePct:
          totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 100) : 0,
        estimatedCommissionPct: commissionPct,
        netRevenueEstimate: net,
      };
    });
  }
}
