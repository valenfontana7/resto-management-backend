import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { MercadoPagoCredentialsService } from '../../mercadopago/mercadopago-credentials.service';
import { EdgeSyncService } from '../../edge-sync/edge-sync.service';
import { getRestaurantProductIntent } from '../onboarding-product-intent';

function todayBusinessDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12),
  );
}

export type GoLiveReadinessResponse = {
  dishCount: number;
  ordersCount: number;
  mpConnected: boolean | null;
  completedOrdersCount: number;
  dailyOpeningComplete: boolean;
  deliveryEnabled: boolean;
  operationsOnly: boolean;
  delivery: {
    zonesReady: number;
    driversLinked: number;
    completedDeliveryOrdersCount: number;
  } | null;
  edgeStatus: {
    restaurantId: string;
    localId: string;
    status: string;
    hostname: string | null;
    version: string | null;
    lastHeartbeatAt: string | null;
    lastLanUrl: string | null;
    lastSyncPullAt: string | null;
    lastSyncPushAt: string | null;
    pendingPushCount: number;
    lastActivityAt: string;
    staleThresholdMinutes: number;
    isStale: boolean;
  } | null;
};

@Injectable()
export class GoLiveReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly mpCredentials: MercadoPagoCredentialsService,
    private readonly edgeSync: EdgeSyncService,
  ) {}

  async getReadiness(
    restaurantId: string,
    userId: string,
  ): Promise<GoLiveReadinessResponse> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        features: true,
        businessRules: true,
        _count: { select: { dishes: true, orders: true } },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const features = restaurant.features as Record<string, boolean> | null;
    const deliveryEnabled = Boolean(features?.delivery);
    const operationsOnly =
      getRestaurantProductIntent(restaurant.businessRules) === 'operations';
    const businessDate = todayBusinessDate();

    const [
      mpStatus,
      completedOrdersCount,
      dailyOperation,
      edgeStatus,
      deliveryMetrics,
    ] = await Promise.all([
      this.resolveMpConnected(restaurantId),
      this.prisma.order.count({
        where: {
          restaurantId,
          OR: [
            { orderSource: 'FLOOR_FINAL' },
            { status: { in: [OrderStatus.PAID, OrderStatus.DELIVERED] } },
          ],
        },
      }),
      this.prisma.dailyOperation.findUnique({
        where: {
          restaurantId_businessDate: { restaurantId, businessDate },
        },
        select: { openingCompletedAt: true },
      }),
      operationsOnly
        ? this.resolveEdgeStatus(restaurantId)
        : Promise.resolve(null),
      deliveryEnabled
        ? this.resolveDeliveryMetrics(restaurantId)
        : Promise.resolve(null),
    ]);

    return {
      dishCount: restaurant._count.dishes,
      ordersCount: restaurant._count.orders,
      mpConnected: mpStatus,
      completedOrdersCount,
      dailyOpeningComplete: Boolean(dailyOperation?.openingCompletedAt),
      deliveryEnabled,
      operationsOnly,
      delivery: deliveryMetrics,
      edgeStatus,
    };
  }

  private async resolveMpConnected(
    restaurantId: string,
  ): Promise<boolean | null> {
    try {
      const status = await this.mpCredentials.getStatus(restaurantId);
      return status.connected;
    } catch {
      return null;
    }
  }

  private async resolveEdgeStatus(
    restaurantId: string,
  ): Promise<GoLiveReadinessResponse['edgeStatus']> {
    try {
      const status = await this.edgeSync.getStatus(restaurantId);
      if (!status.registered) {
        return null;
      }
      return {
        restaurantId: status.restaurantId,
        localId: status.localId,
        status: status.status,
        hostname: status.hostname,
        version: status.version,
        lastHeartbeatAt: status.lastHeartbeatAt,
        lastLanUrl: status.lastLanUrl,
        lastSyncPullAt: status.lastSyncPullAt,
        lastSyncPushAt: status.lastSyncPushAt,
        pendingPushCount: status.pendingPushCount,
        lastActivityAt: status.lastActivityAt,
        staleThresholdMinutes: status.staleThresholdMinutes,
        isStale: status.isStale,
      };
    } catch {
      return null;
    }
  }

  private async resolveDeliveryMetrics(restaurantId: string) {
    const [zones, drivers, completedDeliveryOrdersCount] = await Promise.all([
      this.prisma.deliveryZone.findMany({
        where: { restaurantId },
        select: { isActive: true, polygon: true },
      }),
      this.prisma.deliveryDriver.findMany({
        where: { restaurantId },
        select: { userId: true },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          type: 'DELIVERY',
          status: OrderStatus.DELIVERED,
        },
      }),
    ]);

    const zonesReady = zones.filter(
      (zone) => zone.isActive !== false && zone.polygon != null,
    ).length;
    const driversLinked = drivers.filter((driver) =>
      Boolean(driver.userId),
    ).length;

    return {
      zonesReady,
      driversLinked,
      completedDeliveryOrdersCount,
    };
  }
}
