import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { OrderStatus as DtoOrderStatus } from '../../orders/dto/order.dto';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { DeliveryPricingService } from '../../delivery/services/delivery-pricing.service';
import { GeocodeService } from '../../delivery/services/geocode.service';
import { OrderNotificationsService } from '../../orders/services/order-notifications.service';
import {
  isSalonSellable,
  resolveSalonUnitPrice,
} from '../../common/utils/dish-channel-pricing';
import {
  AddSalonDeliveryItemsDto,
  CreateSalonDeliveryOrderDto,
  UpdateSalonDeliveryOrderDto,
} from '../dto/salon-delivery-order.dto';
import { SALON_PLACEHOLDER_PHONE } from '../../orders/utils/order-channel.util';

@Injectable()
export class SalonDeliveryOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly deliveryPricing: DeliveryPricingService,
    private readonly geocodeService: GeocodeService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  async create(
    restaurantId: string,
    userId: string,
    dto: CreateSalonDeliveryOrderDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const address = dto.deliveryAddress.trim();
    if (address.length < 3) {
      throw new BadRequestException('Ingresá la dirección de entrega');
    }

    const rawPhone = (dto.customerPhone ?? '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    if (rawPhone && phoneDigits.length > 0 && phoneDigits.length < 6) {
      throw new BadRequestException(
        'Ingresá un teléfono válido (mín. 6 dígitos)',
      );
    }
    const phone = phoneDigits.length >= 6 ? rawPhone : SALON_PLACEHOLDER_PHONE;

    const trimmedName = dto.customerName?.trim();
    const customerName = (
      trimmedName ||
      (phone !== SALON_PLACEHOLDER_PHONE
        ? `Tel ${rawPhone}`
        : 'Cliente domicilio')
    ).slice(0, 120);
    const paymentMethod = (dto.paymentMethod?.trim() || 'cash').toLowerCase();
    const paidUpfront =
      paymentMethod === 'cash' || paymentMethod === 'bank-transfer';

    const quote = await this.deliveryPricing.quoteDelivery(restaurantId, {
      type: 'delivery',
      subtotal: 0,
      address,
      zoneId: dto.deliveryZoneId,
    });

    const resolved = this.resolveDeliveryQuote(quote, dto.deliveryZoneId);
    const { deliveryFee, zoneId, estimatedTime } = resolved;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { city: true, country: true },
    });
    const coordinates = await this.geocodeService.coordinatesForDeliveryAddress(
      address,
      restaurant ?? undefined,
    );

    const orderNumber = await this.generateOrderNumber(restaurantId);
    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          restaurantId,
          customerName,
          customerPhone: phone,
          type: 'DELIVERY',
          orderSource: OrderSource.SALON_PHONE,
          status: OrderStatus.CONFIRMED,
          paymentMethod,
          paymentStatus: paidUpfront
            ? PaymentStatus.PAID
            : PaymentStatus.PENDING,
          paidAt: paidUpfront ? new Date() : null,
          confirmedAt: new Date(),
          subtotal: 0,
          deliveryFee,
          total: deliveryFee,
          deliveryAddress: address,
          deliveryZoneId: zoneId,
          estimatedTime,
          publicTrackingToken,
          notes: dto.deliveryNotes?.trim() || null,
          statusHistory: {
            create: {
              toStatus: OrderStatus.CONFIRMED,
              changedBy: userId,
              notes: 'Pedido domicilio desde salón',
            },
          },
        },
        include: this.orderInclude(),
      });

      await tx.deliveryOrder.create({
        data: {
          orderId: created.id,
          deliveryAddress: address,
          zoneId,
          deliveryFee,
          customerNotes: dto.deliveryNotes?.trim() || null,
          status: 'PENDING',
          ...coordinates,
        },
      });

      return created;
    });

    this.notifications.emitNewOrderCreated(restaurantId, order);
    return { order };
  }

  async addItems(
    restaurantId: string,
    orderId: string,
    userId: string,
    dto: AddSalonDeliveryItemsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    if (!dto.items?.length) {
      throw new BadRequestException('items is required');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.orderSource !== OrderSource.SALON_PHONE) {
      throw new BadRequestException(
        'Solo se pueden editar pedidos domicilio del salón',
      );
    }
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('El pedido ya está cerrado');
    }

    const dishIds = dto.items.map((i) => i.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
        deletedAt: null,
        isAvailableInSalon: true,
      },
    });
    const dishMap = new Map(
      dishes.filter(isSalonSellable).map((d) => [d.id, d]),
    );
    if (dishMap.size !== dishIds.length) {
      throw new BadRequestException(
        'Algunos platos no están disponibles en salón',
      );
    }

    const sendToKitchen = dto.items.some((i) => i.sendToKitchen);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const dish = dishMap.get(item.dishId)!;
        const modifierTotal = (item.modifiers ?? []).reduce(
          (sum, m) => sum + Math.round(Number(m.priceAdjustment) || 0),
          0,
        );
        const unitPrice = resolveSalonUnitPrice(dish) + modifierTotal;
        const subtotal = unitPrice * item.quantity;

        await tx.orderItem.create({
          data: {
            orderId,
            dishId: dish.id,
            quantity: item.quantity,
            unitPrice,
            subtotal,
            notes: item.notes ?? null,
            selectedModifiers: item.modifiers?.length
              ? {
                  create: item.modifiers.map((m) => ({
                    modifierId: m.modifierId,
                    name: m.name,
                    priceAdj: Math.round(Number(m.priceAdjustment) || 0),
                  })),
                }
              : undefined,
          },
        });
      }
    });

    const allItems = await this.prisma.orderItem.findMany({
      where: { orderId },
    });
    const subtotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);
    const total = subtotal + (order.deliveryFee ?? 0) - (order.discount ?? 0);

    let nextStatus = order.status;
    const currentStatus = order.status;
    if (
      sendToKitchen &&
      (currentStatus === OrderStatus.CONFIRMED ||
        currentStatus === OrderStatus.PAID)
    ) {
      nextStatus = OrderStatus.PREPARING;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        total,
        status: nextStatus,
        ...(nextStatus === OrderStatus.PREPARING && !order.preparingAt
          ? { preparingAt: new Date() }
          : {}),
        ...(nextStatus === OrderStatus.PREPARING &&
        order.status !== OrderStatus.PREPARING
          ? {
              statusHistory: {
                create: {
                  fromStatus: order.status as OrderStatus,
                  toStatus: OrderStatus.PREPARING,
                  changedBy: userId,
                  notes: 'Enviado a cocina desde salón',
                },
              },
            }
          : {}),
      },
      include: this.orderInclude(),
    });

    if (nextStatus === OrderStatus.PREPARING) {
      void this.notifications.emitKitchenNotification(
        updated,
        DtoOrderStatus.PREPARING,
      );
    }

    return { order: updated };
  }

  async update(
    restaurantId: string,
    orderId: string,
    userId: string,
    dto: UpdateSalonDeliveryOrderDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: true, deliveryOrder: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    this.assertEditableSalonDelivery(order);

    const address = (
      dto.deliveryAddress?.trim() ||
      order.deliveryAddress ||
      ''
    ).trim();
    if (address.length < 3) {
      throw new BadRequestException('Ingresá la dirección de entrega');
    }

    let phone = order.customerPhone;
    if (dto.customerPhone !== undefined) {
      const rawPhone = dto.customerPhone.trim();
      const phoneDigits = rawPhone.replace(/\D/g, '');
      if (rawPhone && phoneDigits.length > 0 && phoneDigits.length < 6) {
        throw new BadRequestException(
          'Ingresá un teléfono válido (mín. 6 dígitos)',
        );
      }
      phone = phoneDigits.length >= 6 ? rawPhone : SALON_PLACEHOLDER_PHONE;
    }

    const trimmedName = dto.customerName?.trim();
    const customerName = (
      trimmedName ||
      order.customerName ||
      (phone !== SALON_PLACEHOLDER_PHONE ? `Tel ${phone}` : 'Cliente domicilio')
    ).slice(0, 120);

    const subtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
    const quote = await this.deliveryPricing.quoteDelivery(restaurantId, {
      type: 'delivery',
      subtotal,
      address,
      zoneId: dto.deliveryZoneId ?? order.deliveryZoneId ?? undefined,
    });
    const resolved = this.resolveDeliveryQuote(
      quote,
      dto.deliveryZoneId ?? order.deliveryZoneId ?? undefined,
    );
    const { deliveryFee, zoneId, estimatedTime } = resolved;

    const total = subtotal + deliveryFee - (order.discount ?? 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          customerName,
          customerPhone: phone,
          deliveryAddress: address,
          deliveryZoneId: zoneId,
          estimatedTime,
          deliveryFee,
          subtotal,
          total,
        },
        include: this.orderInclude(),
      });

      if (order.deliveryOrder) {
        await tx.deliveryOrder.update({
          where: { orderId },
          data: {
            deliveryAddress: address,
            zoneId,
            deliveryFee,
          },
        });
      }

      return next;
    });

    this.notifications.emitOrderUpdate(restaurantId, updated);
    return { order: updated };
  }

  async cancel(restaurantId: string, orderId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    this.assertEditableSalonDelivery(order);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: OrderStatus.CANCELLED,
              changedBy: userId,
              notes: 'Anulado desde salón',
            },
          },
        },
        include: this.orderInclude(),
      });

      await tx.deliveryOrder.updateMany({
        where: { orderId },
        data: { status: 'CANCELLED' },
      });

      return next;
    });

    this.notifications.emitOrderUpdate(restaurantId, updated);
    return { order: updated };
  }

  private assertEditableSalonDelivery(order: {
    orderSource: OrderSource;
    status: OrderStatus;
  }) {
    if (order.orderSource !== OrderSource.SALON_PHONE) {
      throw new BadRequestException(
        'Solo se pueden editar pedidos domicilio del salón',
      );
    }
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('El pedido ya está cerrado');
    }
  }

  private resolveDeliveryQuote(
    quote: Awaited<ReturnType<DeliveryPricingService['quoteDelivery']>>,
    zoneId?: string | null,
  ): {
    deliveryFee: number;
    zoneId: string | null;
    estimatedTime: string | null;
  } {
    if (quote.zone) {
      return {
        deliveryFee: quote.deliveryFee,
        zoneId: quote.zone.id,
        estimatedTime: quote.zone.estimatedTime ?? null,
      };
    }

    if (zoneId) {
      const matched = quote.zones.find((zone) => zone.id === zoneId);
      if (matched) {
        return {
          deliveryFee: matched.deliveryFee,
          zoneId: matched.id,
          estimatedTime: matched.estimatedTime ?? null,
        };
      }
    }

    return {
      deliveryFee: 0,
      zoneId: zoneId ?? null,
      estimatedTime: null,
    };
  }

  private orderInclude(): Prisma.OrderInclude {
    return {
      items: {
        include: {
          dish: true,
          selectedModifiers: true,
        },
      },
      deliveryOrder: true,
    };
  }

  private async generateOrderNumber(restaurantId: string): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [ordersCount, sessionsCount] = await Promise.all([
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      this.prisma.checkoutSession.count({
        where: {
          restaurantId,
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
    ]);

    return `OD-${dateStr}-${String(ordersCount + sessionsCount + 1).padStart(3, '0')}`;
  }
}
