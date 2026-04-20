import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ExternalPlatformConfig = {
  dispatchUrl?: string;
  authHeaderName?: string;
  authScheme?: string;
  quoteUrl?: string;
};

@Injectable()
export class DeliveryDispatchService {
  private readonly logger = new Logger(DeliveryDispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async dispatchOrder(restaurantId: string, orderId: string) {
    const deliveryOrder = await this.prisma.deliveryOrder.findFirst({
      where: {
        orderId,
        order: { restaurantId },
      },
      include: {
        zone: true,
        order: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!deliveryOrder || deliveryOrder.status !== 'READY') {
      return { success: false, mode: 'skipped' as const };
    }

    const activePlatform = await this.prisma.deliveryPlatform.findFirst({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (activePlatform) {
      const externalResult = await this.dispatchToExternalPlatform(
        activePlatform,
        deliveryOrder,
      );

      if (externalResult.success) {
        return externalResult;
      }
    }

    return this.autoAssignDriver(restaurantId, deliveryOrder.id);
  }

  private async autoAssignDriver(
    restaurantId: string,
    deliveryOrderId: string,
  ) {
    const drivers = await this.prisma.deliveryDriver.findMany({
      where: {
        restaurantId,
        isActive: true,
        isAvailable: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (drivers.length === 0) {
      return { success: false, mode: 'manual' as const };
    }

    const rankedDrivers = await Promise.all(
      drivers.map(async (driver) => ({
        driver,
        activeOrders: await this.prisma.deliveryOrder.count({
          where: {
            driverId: driver.id,
            status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
          },
        }),
      })),
    );

    const candidate = rankedDrivers
      .filter((entry) => entry.activeOrders < 3)
      .sort((left, right) => left.activeOrders - right.activeOrders)[0];

    if (!candidate) {
      return { success: false, mode: 'manual' as const };
    }

    await this.prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        driverId: candidate.driver.id,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        driverNotes: this.buildDriverNotes(
          'Auto-asignado por matching interno.',
          null,
        ),
      },
    });

    return {
      success: true,
      mode: 'internal' as const,
      driverId: candidate.driver.id,
      driverName: candidate.driver.name,
    };
  }

  private async dispatchToExternalPlatform(
    platform: {
      id: string;
      restaurantId: string;
      platform: string;
      apiKey: string | null;
      apiSecret: string | null;
      storeId: string | null;
      config: unknown;
    },
    deliveryOrder: {
      id: string;
      orderId: string;
      deliveryAddress: string;
      deliveryFee: number;
      customerNotes: string | null;
      zone: { id: string; name: string } | null;
      order: {
        orderNumber: string;
        customerName: string;
        customerPhone: string;
        subtotal: number;
        total: number;
        notes: string | null;
        items: Array<{
          dishId: string;
          quantity: number;
          unitPrice: number;
          notes: string | null;
        }>;
      };
    },
  ) {
    const config = this.parsePlatformConfig(platform.config);
    const dispatchUrl = config.dispatchUrl?.trim();

    if (!dispatchUrl) {
      return { success: false, mode: 'external' as const };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (platform.apiKey) {
      const authHeaderName = config.authHeaderName || 'Authorization';
      const authScheme = config.authScheme || 'Bearer';
      headers[authHeaderName] = `${authScheme} ${platform.apiKey}`.trim();
    }

    if (platform.apiSecret) {
      headers['X-Api-Secret'] = platform.apiSecret;
    }

    const payload = {
      platform: platform.platform,
      storeId: platform.storeId,
      restaurantId: platform.restaurantId,
      order: {
        id: deliveryOrder.orderId,
        orderNumber: deliveryOrder.order.orderNumber,
        customerName: deliveryOrder.order.customerName,
        customerPhone: deliveryOrder.order.customerPhone,
        deliveryAddress: deliveryOrder.deliveryAddress,
        deliveryFee: deliveryOrder.deliveryFee,
        subtotal: deliveryOrder.order.subtotal,
        total: deliveryOrder.order.total,
        notes: deliveryOrder.order.notes,
        deliveryNotes: deliveryOrder.customerNotes,
        zone: deliveryOrder.zone,
        items: deliveryOrder.order.items.map((item) => ({
          dishId: item.dishId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
        })),
      },
    };

    try {
      const response = await fetch(dispatchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text().catch(() => '');

      if (!response.ok) {
        this.logger.warn(
          `External delivery dispatch failed for ${platform.platform}: ${response.status} ${bodyText}`,
        );
        return { success: false, mode: 'external' as const };
      }

      await this.prisma.deliveryOrder.update({
        where: { id: deliveryOrder.id },
        data: {
          driverNotes: this.buildDriverNotes(
            `Despacho solicitado a ${platform.platform}.`,
            bodyText,
          ),
        },
      });

      return {
        success: true,
        mode: 'external' as const,
        platform: platform.platform,
      };
    } catch (error) {
      this.logger.warn(
        `External delivery dispatch request failed for ${platform.platform}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { success: false, mode: 'external' as const };
    }
  }

  private parsePlatformConfig(config: unknown): ExternalPlatformConfig {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const data = config as Record<string, unknown>;
    return {
      dispatchUrl:
        typeof data.dispatchUrl === 'string' ? data.dispatchUrl : undefined,
      authHeaderName:
        typeof data.authHeaderName === 'string'
          ? data.authHeaderName
          : undefined,
      authScheme:
        typeof data.authScheme === 'string' ? data.authScheme : undefined,
      quoteUrl: typeof data.quoteUrl === 'string' ? data.quoteUrl : undefined,
    };
  }

  private buildDriverNotes(prefix: string, rawBody: string | null) {
    const trimmedBody = rawBody?.trim();
    if (!trimmedBody) {
      return prefix;
    }

    const compactBody = trimmedBody.slice(0, 250);
    return `${prefix}\n${compactBody}`;
  }
}
