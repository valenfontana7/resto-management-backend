import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { OrderNotificationsService } from './services/order-notifications.service';
import { OrderAnalyticsService } from './services/order-analytics.service';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentProviderFactory } from '../payment-providers/payment-provider.factory';
import { DeliveryPricingService } from '../delivery/services/delivery-pricing.service';
import { DeliveryDispatchService } from '../delivery/services/delivery-dispatch.service';
import * as crypto from 'crypto';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  OrderFiltersDto,
  OrderStatus,
  PaymentStatus,
  OrderType,
} from './dto/order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly MERCADOPAGO_PAYMENT_METHOD = 'mercadopago';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly mercadopagoService: MercadoPagoService,
    private readonly configService: ConfigService,
    private readonly notifications: OrderNotificationsService,
    private readonly analytics: OrderAnalyticsService,
    private readonly couponsService: CouponsService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly deliveryPricingService: DeliveryPricingService,
    private readonly deliveryDispatchService: DeliveryDispatchService,
  ) {}

  async create(
    restaurantId: string,
    createDto: CreateOrderDto,
    origin?: string,
    role?: string | null,
  ) {
    void role;
    if (!createDto) {
      throw new BadRequestException('Request body is required');
    }

    const customerName = (createDto.customerName ?? '').trim();
    const customerPhone = (createDto.customerPhone ?? '').trim();
    const paymentMethod = (createDto.paymentMethod ?? '').trim();
    const orderType = createDto.type;

    if (!customerName) {
      throw new BadRequestException('customerName is required');
    }
    if (!customerPhone) {
      throw new BadRequestException('customerPhone is required');
    }
    if (!paymentMethod) {
      throw new BadRequestException('paymentMethod is required');
    }
    if (!orderType) {
      throw new BadRequestException('type is required');
    }

    if (!Array.isArray(createDto.items) || createDto.items.length === 0) {
      throw new BadRequestException('items is required');
    }

    const dishIds = createDto.items.map((item) => item.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
        isAvailable: true,
      },
    });

    if (dishes.length !== dishIds.length) {
      throw new BadRequestException(
        'Some dishes are not available or do not exist',
      );
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        slug: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const orderItems = createDto.items.map((item) => {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish) throw new BadRequestException(`Dish ${item.dishId} not found`);

      const modifierExtra = (item.selectedModifiers || []).reduce(
        (sum, m) => sum + m.priceAdjustment,
        0,
      );
      const unitPrice = (item.unitPrice ?? dish.price) + modifierExtra;

      return {
        dishId: item.dishId,
        name: dish.name,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
        notes: item.notes,
        selectedModifiers: item.selectedModifiers,
      };
    });

    const subtotal =
      createDto.subtotal ??
      orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryQuote =
      orderType === OrderType.DELIVERY
        ? await this.deliveryPricingService.quoteDelivery(restaurantId, {
            type: 'delivery',
            subtotal,
            address: createDto.deliveryAddress,
            zoneId: createDto.deliveryZoneId,
          })
        : null;

    if (orderType === OrderType.DELIVERY) {
      if (!createDto.deliveryAddress?.trim()) {
        throw new BadRequestException(
          'deliveryAddress is required for delivery orders',
        );
      }

      if (!deliveryQuote?.available || !deliveryQuote.zone) {
        throw new BadRequestException(
          deliveryQuote?.message ||
            'No se pudo calcular el delivery para la dirección seleccionada.',
        );
      }

      if (deliveryQuote.minOrder > 0 && subtotal < deliveryQuote.minOrder) {
        throw new BadRequestException(
          `El monto mínimo para ${deliveryQuote.zone.name} es ${deliveryQuote.minOrder}.`,
        );
      }
    }

    const deliveryFee =
      orderType === OrderType.DELIVERY ? (deliveryQuote?.deliveryFee ?? 0) : 0;
    const tip = createDto.tip || 0;

    // Validate and apply coupon if provided
    let discount = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (createDto.couponCode) {
      const validation = await this.couponsService.validate(restaurantId, {
        code: createDto.couponCode,
        orderAmount: subtotal,
      });
      if (!validation.valid) {
        throw new BadRequestException(validation.message);
      }
      discount = Math.round(validation.discountAmount);
      couponId = validation.coupon!.id;
      couponCode = createDto.couponCode;
    }

    const total = createDto.total ?? subtotal + deliveryFee + tip - discount;

    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');
    const orderNumber = await this.generateOrderNumber(restaurantId);

    const ONLINE_PAYMENT_METHODS = ['mercadopago', 'payway'];
    const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(
      String(paymentMethod),
    );
    const resolvedProvider = createDto.paymentProvider ?? paymentMethod;
    if (!isOnlinePayment) {
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          restaurantId,
          publicTrackingToken,
          customerName,
          customerEmail: createDto.customerEmail,
          customerPhone,
          type: orderType,
          status: OrderStatus.PENDING,
          paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          deliveryFee,
          discount,
          couponId,
          couponCode,
          tip,
          total,
          deliveryAddress: createDto.deliveryAddress,
          deliveryZoneId: deliveryQuote?.zone?.id,
          estimatedTime: deliveryQuote?.estimatedTime ?? undefined,
          deliveryNotes: createDto.deliveryNotes,
          tableId: createDto.tableId,
          notes: createDto.notes,
          items: {
            create: orderItems.map((item) => ({
              dishId: item.dishId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              notes: item.notes,
              ...(item.selectedModifiers?.length
                ? {
                    selectedModifiers: {
                      create: item.selectedModifiers.map((m) => ({
                        modifierId: m.modifierId,
                        name: m.name,
                        priceAdjustment: m.priceAdjustment,
                      })),
                    },
                  }
                : {}),
            })),
          },
          statusHistory: {
            create: {
              toStatus: OrderStatus.PENDING,
              changedBy: 'system',
              notes: 'Pedido creado',
            },
          },
        },
        include: {
          items: {
            include: {
              dish: true,
            },
          },
          statusHistory: true,
        },
      });

      // Auto-create DeliveryOrder for DELIVERY type
      if (orderType === OrderType.DELIVERY) {
        await this.createDeliveryOrder(order.id, createDto, {
          deliveryFee,
          zoneId: deliveryQuote?.zone?.id,
          estimatedTime: deliveryQuote?.estimatedTime ?? undefined,
        });
        await this.deliveryDispatchService.dispatchOrder(
          restaurantId,
          order.id,
        );
      }

      // Record coupon usage
      if (couponId && discount > 0) {
        await this.couponsService.incrementUsage(couponId);
        await this.prisma.couponUsage.create({
          data: { couponId, orderId: order.id, discountAmount: discount },
        });
      }

      return {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          publicToken: order.publicTrackingToken,
          createdAt: order.createdAt,
        },
        paymentUrl: undefined,
        sandboxPaymentUrl: undefined,
        isSandbox: false,
        publicTrackingToken: order.publicTrackingToken,
      };
    }

    // Online payment: crear checkout session
    const checkout = await this.prisma.checkoutSession.create({
      data: {
        restaurantId,
        orderNumber,
        publicTrackingToken,
        customerName,
        customerEmail: createDto.customerEmail,
        customerPhone,
        type: orderType,
        paymentMethod,
        paymentProvider: resolvedProvider,
        paymentStatus: PaymentStatus.PENDING,
        isSandbox: false,
        items: orderItems.map((item) => ({
          dishId: item.dishId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          notes: item.notes,
          selectedModifiers: item.selectedModifiers,
        })) as any,
        subtotal,
        deliveryFee,
        discount,
        couponId,
        couponCode,
        tip,
        total,
        deliveryAddress: createDto.deliveryAddress,
        deliveryNotes: createDto.deliveryNotes,
        tableId: createDto.tableId,
        notes: createDto.notes,
      },
    });

    let paymentUrl: string | undefined;
    let sandboxPaymentUrl: string | undefined;
    let isSandbox = false;

    try {
      const requestOrigin =
        origin ||
        this.configService.get('BACKEND_URL') ||
        'http://localhost:4000';

      if (resolvedProvider === 'payway') {
        // Payway: usar PaymentProviderFactory
        const provider = this.paymentProviderFactory.getProvider('payway');
        const result = await provider.createCheckout({
          orderId: checkout.id,
          restaurantId,
          items: orderItems.map((item) => ({
            id: item.dishId,
            title: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          customer: {
            name: customerName,
            email: createDto.customerEmail,
            phone: customerPhone,
          },
          totalAmount: total,
          currency: 'ARS',
          backUrls: {
            success: `${requestOrigin}/order/${checkout.id}?status=approved`,
            failure: `${requestOrigin}/order/${checkout.id}?status=rejected`,
            pending: `${requestOrigin}/order/${checkout.id}?status=pending`,
          },
          notificationUrl: `${requestOrigin}/api/webhooks/payway`,
          externalReference: checkout.id,
        });

        paymentUrl = result.checkoutUrl;
        sandboxPaymentUrl = result.sandboxCheckoutUrl;

        await this.prisma.checkoutSession.update({
          where: { id: checkout.id },
          data: { preferenceId: result.providerSessionId },
        });
      } else {
        // MercadoPago: flujo original
        const preferenceResult = await this.mercadopagoService.createPreference(
          requestOrigin,
          {
            restaurantId,
            slug: restaurant.slug,
            orderId: checkout.id,
            items: orderItems.map((item) => ({
              title: item.name,
              quantity: item.quantity,
              unit_price: item.unitPrice,
            })),
          },
        );

        await this.prisma.checkoutSession.update({
          where: { id: checkout.id },
          data: {
            preferenceId: preferenceResult.preference.id,
            isSandbox: preferenceResult.isSandbox,
          },
        });

        isSandbox = preferenceResult.isSandbox;
        sandboxPaymentUrl = preferenceResult.preference.sandbox_init_point;
        paymentUrl = isSandbox
          ? preferenceResult.preference.sandbox_init_point
          : preferenceResult.preference.init_point;
      }
    } catch (error: any) {
      this.logger.error(
        `Error creating ${resolvedProvider} checkout: ${error.message}`,
      );
    }

    return {
      order: {
        id: checkout.id,
        orderNumber: checkout.orderNumber,
        status: OrderStatus.PENDING,
        publicToken: checkout.publicTrackingToken,
        createdAt: checkout.createdAt,
      },
      paymentUrl,
      sandboxPaymentUrl,
      isSandbox,
      publicTrackingToken: checkout.publicTrackingToken,
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
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
      this.prisma.checkoutSession.count({
        where: {
          restaurantId,
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
    ]);

    const count = ordersCount + sessionsCount;
    return `OD-${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }

  async getPublicOrder(
    restaurantId: string,
    orderId: string,
    token: string,
  ): Promise<{
    id: string;
    orderNumber: string;
    restaurantId: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    type: string;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    tip: number;
    total: number;
    createdAt: Date;
    paidAt: Date | null;
    items: Array<{
      title: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    restaurant: {
      name: string;
      phone: string;
      address: string;
    };
  }> {
    const normalizedToken = (token ?? '').trim();
    if (!normalizedToken) {
      throw new BadRequestException('token es requerido');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId,
      },
      select: {
        id: true,
        orderNumber: true,
        restaurantId: true,
        publicTrackingToken: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        type: true,
        subtotal: true,
        deliveryFee: true,
        discount: true,
        tip: true,
        total: true,
        createdAt: true,
        paidAt: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            subtotal: true,
            dish: {
              select: {
                name: true,
              },
            },
          },
        },
        restaurant: {
          select: {
            name: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (order && order.publicTrackingToken) {
      if (order.publicTrackingToken !== normalizedToken) {
        throw new NotFoundException('Order not found');
      }

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        status: String(order.status),
        paymentStatus: String(order.paymentStatus),
        paymentMethod: String(order.paymentMethod),
        type: String(order.type),
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        tip: order.tip,
        total: order.total,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        items: order.items.map((it) => ({
          title: it.dish.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
        })),
        restaurant: order.restaurant,
      };
    }

    // Fallback: checkout session pendiente
    const checkout = await this.prisma.checkoutSession.findFirst({
      where: {
        id: orderId,
        restaurantId,
      },
      select: {
        id: true,
        orderNumber: true,
        publicTrackingToken: true,
        paymentMethod: true,
        paymentStatus: true,
        type: true,
        subtotal: true,
        deliveryFee: true,
        discount: true,
        tip: true,
        total: true,
        createdAt: true,
        paidAt: true,
        items: true,
        restaurant: {
          select: {
            name: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!checkout || checkout.publicTrackingToken !== normalizedToken) {
      throw new NotFoundException('Order not found');
    }

    const items = Array.isArray(checkout.items)
      ? (checkout.items as any[])
      : [];

    return {
      id: checkout.id,
      orderNumber: checkout.orderNumber,
      restaurantId,
      status: OrderStatus.PENDING,
      paymentStatus: String(checkout.paymentStatus),
      paymentMethod: String(checkout.paymentMethod),
      type: String(checkout.type),
      subtotal: checkout.subtotal,
      deliveryFee: checkout.deliveryFee,
      discount: checkout.discount,
      tip: checkout.tip,
      total: checkout.total,
      createdAt: checkout.createdAt,
      paidAt: checkout.paidAt,
      items: items.map((it) => ({
        title: String(it?.name ?? ''),
        quantity: Number(it?.quantity ?? 0),
        unitPrice: Number(it?.unitPrice ?? 0),
        subtotal: Number(it?.subtotal ?? 0),
      })),
      restaurant: checkout.restaurant,
    };
  }

  async findAll(
    restaurantId: string,
    userId: string,
    filters: OrderFiltersDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const where: any = {
      restaurantId,
    };

    if (filters.status) {
      const statuses = filters.status
        .split(',')
        .map((s) => s.trim().toUpperCase());
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else {
        where.status = { in: statuses };
      }
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.customerPhone) {
      where.customerPhone = {
        contains: filters.customerPhone,
      };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    if (filters.date) {
      const date = new Date(filters.date);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [orders, total, stats] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              dish: true,
            },
          },
          table: true,
          statusHistory: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
      this.getOrderStats(restaurantId, { restaurantId }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  private async getOrderStats(restaurantId: string, baseWhere?: any) {
    const whereBase = baseWhere || { restaurantId };

    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: whereBase,
      _count: { id: true },
    });

    const statuses = [
      'PENDING',
      'PAID',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'DELIVERED',
      'CANCELLED',
    ];

    const result: Record<string, number> = {};
    for (const s of statuses) {
      const found = grouped.find((g) => g.status === s);
      result[s.toLowerCase()] = found?._count?.id ?? 0;
    }
    return result;
  }

  async findOne(id: string, restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        table: true,
        restaurant: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async updateStatus(
    id: string,
    restaurantId: string,
    userId: string,
    updateDto: UpdateOrderStatusDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        items: {
          include: {
            dish: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const parsed = this.parseOrderStatusOrPaymentStatus(updateDto.status);

    // Payment status update
    if (parsed.kind === 'payment') {
      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          paymentStatus: parsed.paymentStatus,
          paidAt:
            parsed.paymentStatus === PaymentStatus.PAID
              ? new Date()
              : order.paidAt,
        },
        include: {
          items: {
            include: {
              dish: true,
            },
          },
          statusHistory: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 5,
          },
        },
      });

      return updatedOrder;
    }

    this.validateStatusTransition(order.status as OrderStatus, parsed.status);

    const updateData: any = {
      status: parsed.status,
      statusHistory: {
        create: {
          fromStatus: order.status as OrderStatus,
          toStatus: parsed.status,
          changedBy: userId,
          notes: updateDto.notes,
        },
      },
    };

    const timestampField = this.getTimestampField(parsed.status);
    if (timestampField) {
      updateData[timestampField] = new Date();
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
    });

    // Send notifications via extracted service
    if (
      [
        'PAID',
        'CONFIRMED',
        'PREPARING',
        'READY',
        'DELIVERED',
        'CANCELLED',
      ].includes(parsed.status)
    ) {
      this.notifications.sendStatusUpdateEmail(updatedOrder, order.restaurant);
    }

    this.notifications.emitOrderUpdate(restaurantId, updatedOrder);
    void this.notifications.emitKitchenNotification(
      updatedOrder,
      parsed.status,
    );

    return updatedOrder;
  }

  private getTimestampField(status: OrderStatus): string | null {
    const mapping: Record<string, string> = {
      PAID: 'paidAt',
      CONFIRMED: 'confirmedAt',
      PREPARING: 'preparingAt',
      READY: 'readyAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
    };
    return mapping[status] || null;
  }

  private parseOrderStatusOrPaymentStatus(
    value: unknown,
  ):
    | { kind: 'status'; status: OrderStatus }
    | { kind: 'payment'; paymentStatus: PaymentStatus } {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('status is required');
    }
    const raw = value.trim();
    const normalized = raw.toUpperCase();

    if (normalized === 'CANCELED') {
      return { kind: 'status', status: OrderStatus.CANCELLED };
    }

    const allowed = new Set<string>(Object.values(OrderStatus));
    if (!allowed.has(normalized)) {
      throw new BadRequestException(
        `Invalid status: ${raw}. Allowed: ${Array.from(allowed).join(', ')}`,
      );
    }

    return { kind: 'status', status: normalized as OrderStatus };
  }

  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [
        OrderStatus.PAID,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PAID]: [
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PAID,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PREPARING]: [
        OrderStatus.CONFIRMED,
        OrderStatus.READY,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.READY]: [
        OrderStatus.PREPARING,
        OrderStatus.CONFIRMED,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Analytics (delegated)
  // ─────────────────────────────────────────────────────────────

  getStats(restaurantId: string, userId: string) {
    return this.analytics.getStats(restaurantId, userId);
  }

  getTodayStats(restaurantId: string, userId: string) {
    return this.analytics.getTodayStats(restaurantId, userId);
  }

  getTopDishes(restaurantId: string, userId: string, period: string) {
    return this.analytics.getTopDishes(restaurantId, userId, period);
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook Payment Processing
  // ─────────────────────────────────────────────────────────────

  async processCheckoutPaymentApproved(
    checkoutSessionId: string,
    paymentId: string,
  ) {
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutSessionId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!checkout) {
      this.logger.warn(
        `CheckoutSession ${checkoutSessionId} not found for payment ${paymentId}`,
      );
      return null;
    }

    const existingOrder = await this.prisma.order.findUnique({
      where: { id: checkoutSessionId },
    });

    if (existingOrder) {
      this.logger.log(
        `Order ${checkoutSessionId} already exists, skipping create`,
      );
      return existingOrder;
    }

    await this.prisma.checkoutSession.update({
      where: { id: checkoutSessionId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentId,
        paidAt: new Date(),
      },
    });

    const items = Array.isArray(checkout.items)
      ? (checkout.items as any[])
      : [];

    const createdOrder = await this.prisma.order.create({
      data: {
        id: checkout.id,
        orderNumber: checkout.orderNumber,
        restaurantId: checkout.restaurantId,
        publicTrackingToken: checkout.publicTrackingToken,
        customerName: checkout.customerName,
        customerEmail: checkout.customerEmail,
        customerPhone: checkout.customerPhone,
        type: checkout.type as any,
        status: OrderStatus.PAID,
        paymentMethod: checkout.paymentMethod,
        paymentStatus: PaymentStatus.PAID,
        paymentId,
        preferenceId: checkout.preferenceId,
        subtotal: checkout.subtotal,
        deliveryFee: checkout.deliveryFee,
        discount: checkout.discount,
        couponId: checkout.couponId,
        couponCode: checkout.couponCode,
        tip: checkout.tip,
        total: checkout.total,
        deliveryAddress: checkout.deliveryAddress,
        deliveryZoneId: null,
        deliveryNotes: checkout.deliveryNotes,
        tableId: checkout.tableId,
        notes: checkout.notes,
        paidAt: new Date(),
        items: {
          create: items.map((it) => ({
            dishId: String(it.dishId),
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            subtotal: Number(it.subtotal),
            notes: it.notes ? String(it.notes) : null,
            ...(Array.isArray(it.selectedModifiers) &&
            it.selectedModifiers.length
              ? {
                  selectedModifiers: {
                    create: it.selectedModifiers.map((m: any) => ({
                      modifierId: String(m.modifierId),
                      name: String(m.name),
                      priceAdjustment: Number(m.priceAdjustment),
                    })),
                  },
                }
              : {}),
          })),
        },
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              changedBy: 'system',
              notes: 'Checkout iniciado',
            },
            {
              fromStatus: OrderStatus.PENDING,
              toStatus: OrderStatus.PAID,
              changedBy: 'system',
              notes: `Pago confirmado (MP: ${paymentId})`,
            },
          ],
        },
      },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
    });

    // Auto-create DeliveryOrder for DELIVERY type
    if (checkout.type === 'DELIVERY') {
      const deliveryQuote = await this.deliveryPricingService.quoteDelivery(
        checkout.restaurantId,
        {
          type: 'delivery',
          subtotal: checkout.subtotal,
          address: checkout.deliveryAddress || undefined,
        },
      );

      if (deliveryQuote.zone?.id || deliveryQuote.estimatedTime) {
        await this.prisma.order.update({
          where: { id: createdOrder.id },
          data: {
            deliveryZoneId: deliveryQuote.zone?.id ?? null,
            estimatedTime: deliveryQuote.estimatedTime ?? null,
          },
        });
      }

      await this.createDeliveryOrder(
        createdOrder.id,
        {
          deliveryAddress: checkout.deliveryAddress,
          deliveryNotes: checkout.deliveryNotes,
        } as any,
        {
          deliveryFee: checkout.deliveryFee,
          zoneId: deliveryQuote.zone?.id,
          estimatedTime: deliveryQuote.estimatedTime ?? undefined,
        },
      );
      await this.deliveryDispatchService.dispatchOrder(
        checkout.restaurantId,
        createdOrder.id,
      );
    }

    // Record coupon usage from checkout
    if (checkout.couponId && checkout.discount > 0) {
      await this.couponsService.incrementUsage(checkout.couponId);
      await this.prisma.couponUsage.create({
        data: {
          couponId: checkout.couponId,
          orderId: createdOrder.id,
          discountAmount: checkout.discount,
        },
      });
    }

    // Send notifications via extracted service
    this.notifications.sendOrderConfirmationEmails(
      createdOrder,
      checkout.restaurant,
    );
    this.notifications.emitPaymentConfirmed(
      checkout.restaurantId,
      createdOrder,
    );

    return createdOrder;
  }

  private async createDeliveryOrder(
    orderId: string,
    dto: { deliveryAddress?: string; deliveryNotes?: string },
    delivery: {
      deliveryFee: number;
      zoneId?: string;
      estimatedTime?: string;
    },
  ) {
    try {
      await this.prisma.deliveryOrder.create({
        data: {
          orderId,
          deliveryAddress: dto.deliveryAddress || '',
          zoneId: delivery.zoneId,
          deliveryFee: delivery.deliveryFee ?? 0,
          estimatedDeliveryTime: this.parseEstimatedTime(
            delivery.estimatedTime,
          ),
          customerNotes: dto.deliveryNotes || null,
          status: 'READY',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create DeliveryOrder for order ${orderId}`,
        error,
      );
    }
  }

  private parseEstimatedTime(value?: string | null): number | undefined {
    if (!value) return undefined;

    const match = value.match(/(\d+)/);
    if (!match) return undefined;

    return Number(match[1]);
  }
}
