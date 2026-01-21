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
import {
  EmailService,
  OrderData,
  RestaurantData,
} from '../email/email.service';
import { OrdersGateway, OrderUpdatePayload } from '../websocket/orders.gateway';
import { KitchenNotificationsService } from '../kitchen/kitchen-notifications.service';
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
    private readonly emailService: EmailService,
    private readonly ordersGateway: OrdersGateway,
    private readonly configService: ConfigService,
    private readonly kitchenNotifications: KitchenNotificationsService,
  ) {}

  async create(
    restaurantId: string,
    createDto: CreateOrderDto,
    origin?: string,
  ) {
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

    // Validar que todos los dishes existan y pertenezcan al restaurante
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

    // Obtener restaurant para el slug
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

    // Calcular totales
    const orderItems = createDto.items.map((item) => {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish) throw new BadRequestException(`Dish ${item.dishId} not found`);

      return {
        dishId: item.dishId,
        name: dish.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? dish.price,
        subtotal: (item.unitPrice ?? dish.price) * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal =
      createDto.subtotal ??
      orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const deliveryFee =
      createDto.deliveryFee ?? (orderType === OrderType.DELIVERY ? 500 : 0);
    const tip = createDto.tip || 0;
    const total = createDto.total ?? subtotal + deliveryFee + tip;

    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');
    const orderNumber = await this.generateOrderNumber(restaurantId);

    // Si NO es MercadoPago, persistimos la Order directamente (no hay webhook para crearla luego)
    const isMercadoPago =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      String(paymentMethod) === this.MERCADOPAGO_PAYMENT_METHOD;
    if (!isMercadoPago) {
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
          tip,
          total,
          deliveryAddress: createDto.deliveryAddress,
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

    // MercadoPago: crear checkout session (NO persistimos Order todavía)
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
        paymentStatus: PaymentStatus.PENDING,
        isSandbox: false,
        items: orderItems.map((item) => ({
          dishId: item.dishId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          notes: item.notes,
        })),
        subtotal,
        deliveryFee,
        tip,
        total,
        deliveryAddress: createDto.deliveryAddress,
        deliveryNotes: createDto.deliveryNotes,
        tableId: createDto.tableId,
        notes: createDto.notes,
      },
    });

    // Crear preferencia
    let paymentUrl: string | undefined;
    let sandboxPaymentUrl: string | undefined;
    let isSandbox = false;

    try {
      const requestOrigin =
        origin ||
        this.configService.get('BACKEND_URL') ||
        'http://localhost:4000';

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

      // Guardar preferenceId e isSandbox en la checkout session
      await this.prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: {
          preferenceId: preferenceResult.preference.id,
          isSandbox: preferenceResult.isSandbox,
        },
      });

      // Asignar URLs y modo sandbox
      isSandbox = preferenceResult.isSandbox;
      sandboxPaymentUrl = preferenceResult.preference.sandbox_init_point;

      // paymentUrl es la URL que el frontend debe usar según el modo
      paymentUrl = isSandbox
        ? preferenceResult.preference.sandbox_init_point
        : preferenceResult.preference.init_point;
    } catch (error: any) {
      this.logger.error(
        `Error creating MercadoPago preference: ${error.message}`,
      );
      // No fallamos el checkout
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

    // Inicio y fin del día
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Contar órdenes + checkout sessions del día para evitar colisiones
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

    // Responder como "no existe" para evitar enumeración.
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

    // Fallback: todavía no existe Order (checkout pendiente)
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
    // Verificar que el usuario pertenece al restaurante
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const where: any = {
      restaurantId,
    };

    if (filters.status) {
      // Support comma-separated statuses and normalize to uppercase for Prisma enum
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

    // If date is provided, filter by that specific date (overrides startDate/endDate)
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

    // Pagination
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
    const statuses = [
      'PENDING',
      'PAID',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'DELIVERED',
      'CANCELLED',
    ];

    // Si hay filtros aplicados (como fecha, tipo, etc), usar baseWhere
    // Si solo se está filtrando por status, mostrar stats globales
    const whereBase = baseWhere || { restaurantId };

    const counts = await Promise.all(
      statuses.map((status) =>
        this.prisma.order.count({
          where: { ...whereBase, status: status as any },
        }),
      ),
    );

    return statuses.reduce(
      (acc, status, index) => {
        acc[status.toLowerCase()] = counts[index];
        return acc;
      },
      {} as Record<string, number>,
    );
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

    // Caso especial: marcar como pagado (UI suele enviar status=paid)
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

    // Validar transiciones de estado válidas
    this.validateStatusTransition(order.status as OrderStatus, parsed.status);

    // Preparar datos de actualización
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

    // Actualizar timestamp correspondiente
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

    // Enviar notificación por email al cliente si es relevante
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
      const orderData = this.mapOrderToEmailData(updatedOrder);
      const restaurantData = this.mapRestaurantToEmailData(order.restaurant);

      this.emailService
        .sendStatusUpdate(orderData, restaurantData)
        .catch((err) => {
          this.logger.error(
            `Failed to send status update email: ${err.message}`,
          );
        });
    }

    // Emitir WebSocket
    const wsPayload = this.mapOrderToWebSocketPayload(updatedOrder);
    this.ordersGateway.emitOrderUpdate(restaurantId, wsPayload);

    // Emitir notificación SSE para cocina
    this.emitKitchenNotification(updatedOrder, parsed.status);

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

    // Alias comunes
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

  async getStats(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, todayOrders, pendingOrders, revenue] =
      await Promise.all([
        this.prisma.order.count({
          where: { restaurantId },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            createdAt: { gte: today },
          },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            status: {
              in: [
                OrderStatus.PENDING,
                OrderStatus.PAID,
                OrderStatus.CONFIRMED,
                OrderStatus.PREPARING,
              ],
            },
          },
        }),
        this.prisma.order.aggregate({
          where: {
            restaurantId,
            status: { not: OrderStatus.CANCELLED },
          },
          _sum: {
            total: true,
          },
        }),
      ]);

    return {
      totalOrders,
      todayOrders,
      pendingOrders,
      revenue: revenue._sum.total || 0,
    };
  }

  async getTodayStats(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrowStart = new Date(today);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Stats de hoy
    const [todayRevenue, todayOrders, todayReservations] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: today, lt: tomorrowStart },
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { total: true },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: today, lt: tomorrowStart },
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: { gte: today, lt: tomorrowStart },
          status: 'CONFIRMED',
        },
      }),
    ]);

    // Stats de ayer
    const [yesterdayRevenue, yesterdayOrders, yesterdayReservations] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            restaurantId,
            createdAt: { gte: yesterday, lt: today },
            status: { not: OrderStatus.CANCELLED },
          },
          _sum: { total: true },
        }),
        this.prisma.order.count({
          where: {
            restaurantId,
            createdAt: { gte: yesterday, lt: today },
            status: { not: OrderStatus.CANCELLED },
          },
        }),
        this.prisma.reservation.count({
          where: {
            restaurantId,
            date: { gte: yesterday, lt: today },
            status: 'CONFIRMED',
          },
        }),
      ]);

    const todayRev = todayRevenue._sum.total || 0;
    const yesterdayRev = yesterdayRevenue._sum.total || 0;
    const todayAvg = todayOrders > 0 ? todayRev / todayOrders : 0;
    const yesterdayAvg =
      yesterdayOrders > 0 ? yesterdayRev / yesterdayOrders : 0;

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      today: {
        revenue: todayRev,
        orders: todayOrders,
        averageOrder: Math.round(todayAvg),
        reservations: todayReservations,
      },
      yesterday: {
        revenue: yesterdayRev,
        orders: yesterdayOrders,
        averageOrder: Math.round(yesterdayAvg),
        reservations: yesterdayReservations,
      },
      percentageChange: {
        revenue: Number(calculateChange(todayRev, yesterdayRev).toFixed(1)),
        orders: Number(
          calculateChange(todayOrders, yesterdayOrders).toFixed(1),
        ),
        averageOrder: Number(
          calculateChange(todayAvg, yesterdayAvg).toFixed(1),
        ),
        reservations: Number(
          calculateChange(todayReservations, yesterdayReservations).toFixed(1),
        ),
      },
    };
  }

  async getTopDishes(restaurantId: string, userId: string, period: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Obtener items de órdenes agrupados por plato
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          createdAt: { gte: startDate },
          status: { not: OrderStatus.CANCELLED },
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

    // Agrupar y calcular totales
    const dishesMap = new Map<
      string,
      {
        dishId: string;
        dishName: string;
        categoryName: string;
        quantity: number;
        revenue: number;
      }
    >();

    orderItems.forEach((item) => {
      const existing = dishesMap.get(item.dishId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
      } else {
        dishesMap.set(item.dishId, {
          dishId: item.dishId,
          dishName: item.dish.name,
          categoryName: item.dish.category.name,
          quantity: item.quantity,
          revenue: item.subtotal,
        });
      }
    });

    // Convertir a array y ordenar por cantidad
    const topDishes = Array.from(dishesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Calcular porcentajes
    const totalRevenue = topDishes.reduce((sum, dish) => sum + dish.revenue, 0);

    return {
      topDishes: topDishes.map((dish) => ({
        ...dish,
        percentage:
          totalRevenue > 0
            ? Number(((dish.revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      })),
    };
  }

  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ) {
    // Transiciones relajadas para manejar imprevistos en cocina
    // Reglas básicas:
    // 1. DELIVERED y CANCELLED son estados finales (no se pueden cambiar)
    // 2. Desde cualquier estado activo se puede cancelar
    // 3. Permite retroceder entre estados de cocina (PREPARING ↔ CONFIRMED ↔ READY)
    // 4. Permite avanzar y retroceder en el flujo de trabajo

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      // PENDING: puede avanzar a PAID o cancelarse
      [OrderStatus.PENDING]: [
        OrderStatus.PAID,
        OrderStatus.CONFIRMED, // Skip directo si ya pagado externamente
        OrderStatus.CANCELLED,
      ],

      // PAID: puede confirmar, volver a pending si hubo error, o cancelarse
      [OrderStatus.PAID]: [
        OrderStatus.PENDING, // Retroceder si hubo error en pago
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],

      // CONFIRMED: máxima flexibilidad para cocina
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PAID, // Volver si necesita reprocesar
        OrderStatus.PREPARING,
        OrderStatus.READY, // Skip directo si ya está listo
        OrderStatus.CANCELLED,
      ],

      // PREPARING: puede retroceder a CONFIRMED, avanzar a READY, o cancelarse
      [OrderStatus.PREPARING]: [
        OrderStatus.CONFIRMED, // Volver si hubo error o falta ingrediente
        OrderStatus.READY,
        OrderStatus.CANCELLED,
      ],

      // READY: puede retroceder a PREPARING, avanzar a DELIVERED, o cancelarse
      [OrderStatus.READY]: [
        OrderStatus.PREPARING, // Volver si necesita recalentarse o ajustes
        OrderStatus.CONFIRMED, // Volver más atrás si hay problema mayor
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
      ],

      // DELIVERED: estado final, no se puede cambiar
      [OrderStatus.DELIVERED]: [],

      // CANCELLED: estado final, no se puede cambiar
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

    // Idempotencia: si ya existe la Order (misma id), no recrear
    const existingOrder = await this.prisma.order.findUnique({
      where: { id: checkoutSessionId },
    });

    if (existingOrder) {
      this.logger.log(
        `Order ${checkoutSessionId} already exists, skipping create`,
      );
      return existingOrder;
    }

    // Marcar checkout como pagado
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

    // Crear Order (usando el mismo id que la checkout session)
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
        tip: checkout.tip,
        total: checkout.total,
        deliveryAddress: checkout.deliveryAddress,
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

    // Preparar datos para emails
    const orderData = this.mapOrderToEmailData(createdOrder);
    const restaurantData = this.mapRestaurantToEmailData(checkout.restaurant);

    // Enviar email al cliente
    this.emailService
      .sendOrderConfirmation(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(
          `Failed to send order confirmation email: ${err.message}`,
        );
      });

    // Enviar email al restaurante
    this.emailService
      .sendNewOrderNotification(orderData, restaurantData)
      .catch((err) => {
        this.logger.error(
          `Failed to send new order notification: ${err.message}`,
        );
      });

    // Emitir WebSocket
    const wsPayload = this.mapOrderToWebSocketPayload(createdOrder);
    this.ordersGateway.emitPaymentConfirmed(checkout.restaurantId, wsPayload);
    this.ordersGateway.emitNewOrder(checkout.restaurantId, wsPayload);

    return createdOrder;
  }

  private mapOrderToEmailData(order: any): OrderData {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      type: order.type,
      status: order.status,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      tip: order.tip,
      total: order.total,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      publicTrackingToken: order.publicTrackingToken,
      items: order.items.map((item: any) => ({
        name: item.dish?.name || item.name || 'Item',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes,
      })),
    };
  }

  private mapRestaurantToEmailData(restaurant: any): RestaurantData {
    return {
      id: restaurant.id,
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
    };
  }

  private mapOrderToWebSocketPayload(order: any): OrderUpdatePayload {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: order.type,
      total: order.total,
      items: order.items.map((item: any) => ({
        name: item.dish?.name || item.name || 'Item',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Emite notificaciones SSE para la cocina basadas en cambios de estado de pedidos
   */
  private emitKitchenNotification(order: any, newStatus: OrderStatus) {
    let notificationType:
      | 'order_created'
      | 'order_updated'
      | 'order_cancelled'
      | 'order_ready';

    switch (newStatus) {
      case OrderStatus.CONFIRMED:
        notificationType = 'order_created';
        break;
      case OrderStatus.PREPARING:
      case OrderStatus.READY:
        notificationType = 'order_updated';
        break;
      case OrderStatus.CANCELLED:
        notificationType = 'order_cancelled';
        break;
      default:
        // No emitir notificación para otros estados
        return;
    }

    // Solo emitir para pedidos que requieren preparación en cocina
    if (
      order.type === OrderType.DINE_IN ||
      order.type === OrderType.PICKUP ||
      order.type === OrderType.DELIVERY
    ) {
      this.kitchenNotifications.emitNotification(order.restaurantId, {
        type: notificationType,
        orderId: order.id,
        data: {
          orderNumber: order.orderNumber,
          status: newStatus,
          customerName: order.customerName,
          type: order.type,
          items:
            order.items?.map((item: any) => ({
              name: item.dish?.name || item.name || 'Item',
              quantity: item.quantity,
              notes: item.notes,
            })) || [],
          total: order.total,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });
    }
  }
}
