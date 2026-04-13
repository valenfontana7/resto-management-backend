import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ExternalOrdersService {
  private readonly logger = new Logger(ExternalOrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    restaurantId: string,
    filters?: { status?: string; platformId?: string },
  ) {
    return this.prisma.externalOrder.findMany({
      where: {
        restaurantId,
        ...(filters?.status && { externalStatus: filters.status }),
        ...(filters?.platformId && { platformId: filters.platformId }),
      },
      include: {
        platform: { select: { platform: true } },
        internalOrder: {
          select: { id: true, orderNumber: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getById(restaurantId: string, externalOrderId: string) {
    const order = await this.prisma.externalOrder.findFirst({
      where: { id: externalOrderId, restaurantId },
      include: {
        platform: { select: { platform: true, storeId: true } },
        internalOrder: {
          select: { id: true, orderNumber: true, status: true, items: true },
        },
      },
    });
    if (!order) throw new NotFoundException('External order not found');
    return order;
  }

  /**
   * Receives a webhook from an external platform and creates an ExternalOrder
   */
  async receiveWebhook(webhookSecret: string, payload: any) {
    const platform = await this.prisma.deliveryPlatform.findFirst({
      where: { webhookSecret, isActive: true },
    });

    if (!platform) {
      this.logger.warn('Webhook received with invalid secret');
      throw new BadRequestException('Invalid webhook secret');
    }

    const externalOrderId = String(
      payload.order_id || payload.orderId || payload.id || crypto.randomUUID(),
    );

    const existing = await this.prisma.externalOrder.findUnique({
      where: {
        platformId_externalOrderId: {
          platformId: platform.id,
          externalOrderId,
        },
      },
    });
    if (existing) {
      return this.updateExternalStatus(existing.id, payload);
    }

    const items = this.extractItems(payload, platform.platform as string);
    const totals = this.extractTotals(payload, items);

    const externalOrder = await this.prisma.externalOrder.create({
      data: {
        platformId: platform.id,
        restaurantId: platform.restaurantId,
        externalOrderId,
        externalStatus: String(payload.status || 'NEW'),
        customerName: String(
          payload.customer_name || payload.customerName || 'Cliente externo',
        ),
        customerPhone: payload.customer_phone || payload.customerPhone || null,
        deliveryAddress:
          payload.delivery_address || payload.deliveryAddress || null,
        items: items as any,
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        platformFee: totals.platformFee,
        total: totals.total,
        rawPayload: payload,
      },
      include: { platform: { select: { platform: true } } },
    });

    this.logger.log(
      `External order ${externalOrderId} received from ${platform.platform} for restaurant ${platform.restaurantId}`,
    );

    return externalOrder;
  }

  /**
   * Accept an external order and sync it as an internal Order
   */
  async accept(restaurantId: string, externalOrderId: string) {
    const extOrder = await this.getById(restaurantId, externalOrderId);

    if (extOrder.internalOrderId) {
      throw new BadRequestException('Order already synced');
    }
    if (extOrder.rejectedAt) {
      throw new BadRequestException('Order was rejected');
    }

    const orderNumber = await this.generateOrderNumber(restaurantId);
    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');
    const items = Array.isArray(extOrder.items)
      ? (extOrder.items as any[])
      : [];

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        restaurantId,
        publicTrackingToken,
        customerName: extOrder.customerName,
        customerPhone: extOrder.customerPhone || '',
        type: 'DELIVERY',
        status: 'CONFIRMED',
        paymentMethod: `external_${extOrder.platform.platform.toLowerCase()}`,
        paymentStatus: 'PAID',
        subtotal: extOrder.subtotal,
        deliveryFee: extOrder.deliveryFee,
        total: extOrder.total,
        deliveryAddress: extOrder.deliveryAddress,
        notes: `Pedido externo #${extOrder.externalOrderId} (${extOrder.platform.platform})`,
        items: {
          create: items.map((it) => ({
            dishId: it.dishId || null,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            subtotal: Number(it.subtotal),
            notes: it.notes || null,
          })),
        },
        statusHistory: {
          create: {
            toStatus: 'CONFIRMED',
            changedBy: 'system',
            notes: `Aceptado desde ${extOrder.platform.platform}`,
          },
        },
      },
    });

    await this.prisma.externalOrder.update({
      where: { id: externalOrderId },
      data: {
        internalOrderId: order.id,
        syncedAt: new Date(),
        externalStatus: 'ACCEPTED',
      },
    });

    // Also create DeliveryOrder
    await this.prisma.deliveryOrder.create({
      data: {
        orderId: order.id,
        deliveryAddress: extOrder.deliveryAddress || '',
        deliveryFee: extOrder.deliveryFee,
        status: 'READY',
      },
    });

    this.logger.log(
      `External order ${externalOrderId} synced as internal order ${order.id}`,
    );
    return { orderId: order.id, orderNumber };
  }

  /**
   * Reject an external order
   */
  async reject(restaurantId: string, externalOrderId: string, reason?: string) {
    const extOrder = await this.getById(restaurantId, externalOrderId);

    if (extOrder.internalOrderId) {
      throw new BadRequestException('Order already synced, cannot reject');
    }

    await this.prisma.externalOrder.update({
      where: { id: externalOrderId },
      data: {
        rejectedAt: new Date(),
        rejectionReason: reason || 'Rechazado por el restaurante',
        externalStatus: 'REJECTED',
      },
    });

    return { rejected: true };
  }

  private async updateExternalStatus(id: string, payload: any) {
    return this.prisma.externalOrder.update({
      where: { id },
      data: {
        externalStatus: String(payload.status || 'UPDATED'),
        rawPayload: payload,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private extractItems(payload: any, _platform: string): any[] {
    const rawItems =
      payload.items || payload.products || payload.order_items || [];
    return rawItems.map((item: any) => ({
      name: item.name || item.product_name || item.description || 'Item',
      externalId: item.id || item.product_id || null,
      quantity: Number(item.quantity || 1),
      unitPrice: Math.round(Number(item.unit_price || item.price || 0) * 100),
      subtotal: Math.round(
        Number(
          item.total ||
            item.subtotal ||
            (item.price || 0) * (item.quantity || 1),
        ) * 100,
      ),
      notes: item.notes || item.comment || null,
    }));
  }

  private extractTotals(payload: any, items: any[]) {
    const subtotal = payload.subtotal
      ? Math.round(Number(payload.subtotal) * 100)
      : items.reduce((s: number, i: any) => s + i.subtotal, 0);
    const deliveryFee = Math.round(
      Number(payload.delivery_fee || payload.deliveryFee || 0) * 100,
    );
    const platformFee = Math.round(
      Number(payload.platform_fee || payload.platformFee || 0) * 100,
    );
    const total = payload.total
      ? Math.round(Number(payload.total) * 100)
      : subtotal + deliveryFee;

    return { subtotal, deliveryFee, platformFee, total };
  }

  private async generateOrderNumber(restaurantId: string): Promise<string> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lt: new Date(today.setHours(23, 59, 59, 999)),
        },
      },
    });
    return `EXT-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }
}
