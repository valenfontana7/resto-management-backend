import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

export interface KitchenStationConfig {
  id: string;
  name: string;
  code: string;
  categoryIds?: string[];
}

export interface KitchenStationItemView {
  itemId: string;
  orderId: string;
  orderNumber: string;
  dishName: string;
  quantity: number;
  kitchenStatus: string;
  stationId: string;
  stationName: string;
  tableLabel?: string;
  createdAt: string;
}

const DEFAULT_STATIONS: KitchenStationConfig[] = [
  { id: 'kitchen', name: 'Cocina', code: 'KITCHEN' },
  { id: 'bar', name: 'Barra', code: 'BAR' },
  { id: 'expo', name: 'Expo', code: 'EXPO' },
];

@Injectable()
export class KitchenStationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStations(restaurantId: string): Promise<KitchenStationConfig[]> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    const rules = restaurant?.businessRules as Record<string, unknown> | null;
    const ops = rules?.operations as Record<string, unknown> | undefined;
    const stations = ops?.stations as KitchenStationConfig[] | undefined;

    if (Array.isArray(stations) && stations.length > 0) {
      return stations;
    }

    return DEFAULT_STATIONS;
  }

  async getItemsByStation(
    restaurantId: string,
    stationId?: string,
  ): Promise<KitchenStationItemView[]> {
    const stations = await this.getStations(restaurantId);

    const sessions = await this.prisma.tableSession.findMany({
      where: {
        restaurantId,
        status: 'OPEN',
      },
      include: {
        items: {
          where: {
            kitchenStatus: { in: ['SENT', 'PREPARING', 'READY'] },
          },
          include: {
            dish: { select: { name: true, categoryId: true } },
          },
        },
        table: { select: { number: true } },
      },
    });

    const items: KitchenStationItemView[] = [];

    for (const session of sessions) {
      for (const item of session.items) {
        const assigned = this.resolveStationForItem(
          item.dish.categoryId,
          stations,
        );
        if (stationId && assigned.id !== stationId) continue;

        items.push({
          itemId: item.id,
          orderId: session.id,
          orderNumber: session.id.slice(-6).toUpperCase(),
          dishName: item.name || item.dish.name,
          quantity: item.quantity,
          kitchenStatus: item.kitchenStatus,
          stationId: assigned.id,
          stationName: assigned.name,
          tableLabel:
            session.table?.number != null
              ? `Mesa ${session.table.number}`
              : undefined,
          createdAt: item.createdAt.toISOString(),
        });
      }
    }

    // Pedidos online en cocina (por pedido, mapeados a estación default)
    const onlineOrders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY],
        },
        OR: [{ scheduledFor: null }, { kitchenReleasedAt: { not: null } }],
      },
      include: {
        items: {
          include: { dish: { select: { name: true, categoryId: true } } },
        },
      },
      take: 50,
    });

    for (const order of onlineOrders) {
      for (const orderItem of order.items) {
        const assigned = this.resolveStationForItem(
          orderItem.dish.categoryId,
          stations,
        );
        if (stationId && assigned.id !== stationId) continue;

        items.push({
          itemId: orderItem.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          dishName: orderItem.dish.name,
          quantity: orderItem.quantity,
          kitchenStatus: order.status,
          stationId: assigned.id,
          stationName: assigned.name,
          createdAt: order.createdAt.toISOString(),
        });
      }
    }

    return items;
  }

  private resolveStationForItem(
    categoryId: string | null | undefined,
    stations: KitchenStationConfig[],
  ): KitchenStationConfig {
    if (categoryId) {
      const match = stations.find((s) => s.categoryIds?.includes(categoryId));
      if (match) return match;
    }
    return stations[0] ?? DEFAULT_STATIONS[0];
  }
}
