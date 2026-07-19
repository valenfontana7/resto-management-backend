import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  Optional,
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
import { DeliveryService } from '../delivery/delivery.service';
import { GeocodeService } from '../delivery/services/geocode.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CustomersService } from '../customers/customers.service';
import { InventoryConsumptionService } from '../business-health/inventory-consumption.service';
import { BusinessEventPublisherService } from '../business-events/business-event-publisher.service';
import { PaymentBusinessEventsService } from '../business-events/publishers/payment-business-events.service';
import { BentooBusinessEventType } from '../business-events/types/event-type.enum';
import { OperationalEventEmitter } from '../event-spine/operational-event-emitter.service';
import { OPERATIONAL_EVENT_TYPES } from '../event-spine/operational-event.types';
import { BusinessClockService } from '../common/time/business-clock.service';
import * as crypto from 'crypto';
import { Prisma, OrderSource, ComandaItemStatus } from '@prisma/client';
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
    @Inject(forwardRef(() => MercadoPagoService))
    private readonly mercadopagoService: MercadoPagoService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => OrderNotificationsService))
    private readonly notifications: OrderNotificationsService,
    private readonly analytics: OrderAnalyticsService,
    private readonly couponsService: CouponsService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    @Inject(forwardRef(() => DeliveryPricingService))
    private readonly deliveryPricingService: DeliveryPricingService,
    @Inject(forwardRef(() => DeliveryDispatchService))
    private readonly deliveryDispatchService: DeliveryDispatchService,
    @Inject(forwardRef(() => DeliveryService))
    private readonly deliveryService: DeliveryService,
    @Inject(forwardRef(() => GeocodeService))
    private readonly geocodeService: GeocodeService,
    @Inject(forwardRef(() => LoyaltyService))
    private readonly loyaltyService: LoyaltyService,
    private readonly customersService: CustomersService,
    @Inject(forwardRef(() => InventoryConsumptionService))
    private readonly inventoryConsumption: InventoryConsumptionService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly paymentEvents: PaymentBusinessEventsService,
    @Inject(forwardRef(() => OperationalEventEmitter))
    private readonly operationalEvents: OperationalEventEmitter,
    @Optional() private readonly businessClock?: BusinessClockService,
  ) {}

  async create(
    restaurantId: string,
    createDto: CreateOrderDto,
    origin?: string,
  ) {
    if (!createDto) {
      throw new BadRequestException('Request body is required');
    }

    const businessNow = this.getBusinessNow();
    const customerName = (createDto.customerName ?? '').trim();
    const customerPhone = (createDto.customerPhone ?? '').trim();
    const paymentMethod = (createDto.paymentMethod ?? '').trim();
    const normalizedPaymentMethod =
      this.normalizePaymentMethodForConfig(paymentMethod);
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
        city: true,
        country: true,
        businessRules: true,
        features: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const enabledPaymentMethods = this.extractEnabledPaymentMethods(
      restaurant.businessRules,
    );
    this.assertPaymentMethodEnabled(
      normalizedPaymentMethod,
      enabledPaymentMethods,
    );

    this.assertOrderTypeAllowed(
      orderType,
      restaurant.features,
      restaurant.businessRules,
    );

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

    const isOnlinePayment = this.isOnlinePaymentMethod(normalizedPaymentMethod);
    const resolvedProvider = this.normalizePaymentProvider(
      createDto.paymentProvider ?? paymentMethod,
    );
    // Si el cliente eligió explícitamente un provider online (MP/Payway),
    // forzamos flujo online aunque el paymentMethod sea credit-card/debit-card
    // (caso: Payway con tarjeta vía checkout link / formulario integrado).
    const explicitOnlineProvider = Boolean(
      createDto.paymentProvider &&
        ['mercadopago', 'payway'].includes(
          String(createDto.paymentProvider).trim().toLowerCase(),
        ),
    );
    const shouldCreateOnlineCheckout =
      isOnlinePayment || explicitOnlineProvider;
    const customerProfile = await this.createCustomerProfileForOrder(
      restaurantId,
      {
        name: customerName,
        email: createDto.customerEmail,
        phone: customerPhone,
      },
    );

    if (!shouldCreateOnlineCheckout) {
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          restaurantId,
          customerProfileId: customerProfile?.id,
          publicTrackingToken,
          customerName,
          customerEmail: createDto.customerEmail,
          customerPhone,
          type: orderType,
          status: OrderStatus.CONFIRMED,
          paymentMethod,
          paymentStatus: PaymentStatus.PENDING,
          confirmedAt: businessNow,
          createdAt: businessNow,
          updatedAt: businessNow,
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
              toStatus: OrderStatus.CONFIRMED,
              changedBy: 'system',
              notes: 'Pedido recibido (pago pendiente)',
              createdAt: businessNow,
            },
          },
        },
        include: {
          items: {
            include: {
              dish: true,
              selectedModifiers: true,
            },
          },
          statusHistory: true,
        },
      });

      // Auto-create DeliveryOrder for DELIVERY type
      if (orderType === OrderType.DELIVERY) {
        await this.createDeliveryOrder(
          order.id,
          createDto,
          {
            deliveryFee,
            zoneId: deliveryQuote?.zone?.id,
            estimatedTime: deliveryQuote?.estimatedTime ?? undefined,
          },
          {
            city: restaurant.city,
            country: restaurant.country,
          },
        );
      }

      // Record coupon usage
      if (couponId && discount > 0) {
        await this.couponsService.incrementUsage(couponId);
        await this.prisma.couponUsage.create({
          data: { couponId, orderId: order.id, discountAmount: discount },
        });
      }

      // Notificar al admin (Socket.IO) y a cocina (SSE) que entró un pedido nuevo
      this.notifications.emitNewOrderCreated(restaurantId, order);
      void this.notifications.emitKitchenNotification(
        order,
        OrderStatus.CONFIRMED,
      );

      void this.publishOrderCreatedEvent(restaurantId, order);
      this.operationalEvents.emit({
        restaurantId,
        eventType: OPERATIONAL_EVENT_TYPES.ORDER_CREATED,
        aggregateType: 'order',
        aggregateId: order.id,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          total: Number(order.total),
          customerName: order.customerName,
          source: 'checkout',
        },
      });
      void this.publishCustomerReturnedIfApplicable(
        restaurantId,
        customerProfile?.id,
        customerName,
        order.id,
      );

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
        customerProfileId: customerProfile?.id,
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
        deliveryZoneId: deliveryQuote?.zone?.id,
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
            publicTrackingToken: checkout.publicTrackingToken,
          },
          { trusted: true },
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
      const message = String(error?.message ?? '');
      this.logger.error(
        `Error creating ${resolvedProvider} checkout: ${message}`,
      );

      if (
        resolvedProvider === this.MERCADOPAGO_PAYMENT_METHOD &&
        (message.includes('MercadoPago no conectado') ||
          message.includes('MERCADOPAGO_ACCESS_TOKEN') ||
          message.includes('falta token'))
      ) {
        throw new BadRequestException(
          'Mercado Pago no está conectado para este restaurante. Agregá el Access Token en Ajustes > Pagos para empezar a cobrar online.',
        );
      }

      throw new BadRequestException(
        'No se pudo iniciar el pago online. Revisá la configuración del proveedor o intentá con otro método de pago.',
      );
    }

    if (!paymentUrl) {
      throw new BadRequestException(
        'No se pudo generar el enlace de pago. Revisá la configuración del proveedor de pago.',
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

  private normalizePaymentMethodForConfig(method: string): string {
    const normalized = String(method ?? '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');

    const aliases: Record<string, string> = {
      debit: 'debit-card',
      credit: 'credit-card',
      transfer: 'bank-transfer',
      mercadopago: 'digital-wallet',
      // 'payway' NO se colapsa a digital-wallet: Payway puede cobrar tarjeta
      // (credit-card / debit-card) y queremos preservar el método real.
      'digital-wallet': 'digital-wallet',
    };

    return aliases[normalized] ?? normalized;
  }

  private normalizePaymentProvider(provider: string): 'mercadopago' | 'payway' {
    const normalized = String(provider ?? '')
      .trim()
      .toLowerCase();
    return normalized === 'payway' ? 'payway' : 'mercadopago';
  }

  private isOnlinePaymentMethod(normalizedMethod: string): boolean {
    return normalizedMethod === 'digital-wallet';
  }

  private extractEnabledPaymentMethods(businessRules: unknown): string[] {
    if (!businessRules || typeof businessRules !== 'object') {
      return [];
    }

    const rules = businessRules as Record<string, unknown>;
    const payment =
      rules.payment && typeof rules.payment === 'object'
        ? (rules.payment as Record<string, unknown>)
        : null;

    if (!payment || !Array.isArray(payment.methods)) {
      return [];
    }

    return Array.from(
      new Set(
        payment.methods
          .map((method) => this.normalizePaymentMethodForConfig(String(method)))
          .filter(Boolean),
      ),
    );
  }

  private assertPaymentMethodEnabled(
    normalizedMethod: string,
    enabledMethods: string[],
  ): void {
    // If no explicit config exists, keep backward compatibility and allow all.
    if (enabledMethods.length === 0) {
      return;
    }

    if (!enabledMethods.includes(normalizedMethod)) {
      throw new BadRequestException(
        'El metodo de pago seleccionado no esta habilitado para este restaurante',
      );
    }
  }

  private async generateOrderNumber(restaurantId: string): Promise<string> {
    const today = this.getBusinessNow();
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
      dishId: string;
      name: string;
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
            dishId: true,
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
          dishId: it.dishId,
          name: it.dish.name,
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

    if (
      (checkout.paymentStatus as string) !== (PaymentStatus.PAID as string) ||
      !checkout.paidAt
    ) {
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
        dishId: String(it?.dishId ?? ''),
        name: String(it?.name ?? ''),
        title: String(it?.name ?? ''),
        quantity: Number(it?.quantity ?? 0),
        unitPrice: Number(it?.unitPrice ?? 0),
        subtotal: Number(it?.subtotal ?? 0),
      })),
      restaurant: checkout.restaurant,
    };
  }

  async getPublicOrderByToken(orderId: string, token: string) {
    const normalizedToken = (token ?? '').trim();
    if (!normalizedToken) {
      throw new BadRequestException('token es requerido');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
      },
      select: {
        restaurantId: true,
        publicTrackingToken: true,
      },
    });

    if (order?.publicTrackingToken === normalizedToken) {
      return this.getPublicOrder(order.restaurantId, orderId, normalizedToken);
    }

    const checkout = await this.prisma.checkoutSession.findFirst({
      where: {
        id: orderId,
      },
      select: {
        restaurantId: true,
        publicTrackingToken: true,
      },
    });

    if (checkout?.publicTrackingToken === normalizedToken) {
      return this.getPublicOrder(
        checkout.restaurantId,
        orderId,
        normalizedToken,
      );
    }

    throw new NotFoundException('Order not found');
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

    if (filters.lite) {
      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
            type: true,
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            orderSource: true,
            paymentMethod: true,
            paymentStatus: true,
            restaurantId: true,
            _count: { select: { items: true } },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    }

    const [orders, total, stats] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              dish: true,
              selectedModifiers: true,
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
            selectedModifiers: true,
          },
        },
        table: true,
        restaurant: {
          select: {
            name: true,
            email: true,
            phone: true,
            address: true,
            logo: true,
            branding: true,
            features: true,
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
            logo: true,
            branding: true,
            features: true,
          },
        },
        items: {
          include: {
            dish: true,
            selectedModifiers: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const parsed = this.parseOrderStatusOrPaymentStatus(updateDto.status);
    const businessNow = this.getBusinessNow();

    if (parsed.kind === 'payment') {
      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          paymentStatus: parsed.paymentStatus,
          paidAt:
            parsed.paymentStatus === PaymentStatus.PAID
              ? businessNow
              : order.paidAt,
        },
        include: {
          items: {
            include: {
              dish: true,
              selectedModifiers: true,
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

      if (parsed.paymentStatus === PaymentStatus.PAID) {
        void this.tryInventoryDeduction(id);
      }

      return updatedOrder;
    }

    if (parsed.status === (order.status as OrderStatus)) {
      return order;
    }

    const transitionSteps = this.resolveStatusTransitionSteps(
      order.status as OrderStatus,
      parsed.status,
    );

    let rollingStatus = order.status as OrderStatus;
    for (const step of transitionSteps) {
      this.validateStatusTransition(rollingStatus, step);
      rollingStatus = step;
    }

    const finalStatus = transitionSteps[transitionSteps.length - 1];

    const updateData: any = {
      status: finalStatus,
      statusHistory: {
        create: transitionSteps.map((step, index) => ({
          fromStatus:
            index === 0
              ? (order.status as OrderStatus)
              : transitionSteps[index - 1],
          toStatus: step,
          changedBy: userId,
          notes:
            index === transitionSteps.length - 1 ? updateDto.notes : undefined,
          createdAt: businessNow,
        })),
      },
    };

    for (const step of transitionSteps) {
      const timestampField = this.getTimestampField(step);
      if (timestampField) {
        updateData[timestampField] = businessNow;
      }
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          items: {
            include: {
              dish: true,
              selectedModifiers: true,
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

      await this.syncFloorComandaKitchenItemsTx(tx, saved, finalStatus);

      return saved;
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
      ].includes(finalStatus)
    ) {
      this.notifications.sendStatusUpdateEmail(updatedOrder, order.restaurant);
    }

    this.notifications.emitOrderUpdate(restaurantId, updatedOrder);
    // Solo notificar cocina/toast cuando el estado realmente cambió.
    if ((order.status as OrderStatus) !== finalStatus) {
      void this.notifications.emitKitchenNotification(
        updatedOrder,
        finalStatus,
      );
    }

    this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED,
      aggregateType: 'order',
      aggregateId: id,
      data: {
        orderId: id,
        fromStatus: order.status,
        toStatus: finalStatus,
        paymentStatus: updatedOrder.paymentStatus,
      },
    });

    if (finalStatus === OrderStatus.DELIVERED) {
      await this.awardLoyaltyPointsForDeliveredOrder(
        updatedOrder,
        order.restaurant,
      );
    }

    if (
      (updatedOrder.type as string) === (OrderType.DELIVERY as string) &&
      (finalStatus === OrderStatus.READY ||
        finalStatus === OrderStatus.CANCELLED)
    ) {
      await this.syncDeliveryOrderForOrderStatus(
        restaurantId,
        updatedOrder.id,
        finalStatus,
      );
    }

    return updatedOrder;
  }

  async markPaymentReceived(
    id: string,
    restaurantId: string,
    userId: string,
    paymentMethod: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: { id, restaurantId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if ((order.paymentStatus as string) === (PaymentStatus.PAID as string)) {
      return order;
    }

    const normalizedMethod = (paymentMethod ?? 'cash').trim() || 'cash';

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: normalizedMethod,
        paidAt: new Date(),
      },
      include: {
        items: {
          include: {
            dish: true,
            selectedModifiers: true,
          },
        },
      },
    });

    this.notifications.emitOrderUpdate(restaurantId, updated);
    void this.tryInventoryDeduction(id);
    this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED,
      aggregateType: 'order',
      aggregateId: id,
      data: {
        orderId: id,
        fromStatus: order.status,
        toStatus: order.status,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: normalizedMethod,
        source: 'mark_payment_received',
      },
    });
    return updated;
  }

  async dispatchDeliveryFromSalon(
    id: string,
    restaurantId: string,
    userId: string,
    driverId: string,
    paymentMethod?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const order = await this.prisma.order.findFirst({
      where: { id, restaurantId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if ((order.type as string) !== (OrderType.DELIVERY as string)) {
      throw new BadRequestException('El pedido no es de delivery');
    }

    if ((order.status as string) !== (OrderStatus.READY as string)) {
      throw new BadRequestException(
        `El pedido debe estar listo para despachar. Estado actual: ${order.status}`,
      );
    }

    const unpaid =
      (order.paymentStatus as string) !== (PaymentStatus.PAID as string) &&
      !order.paymentId;

    if (unpaid) {
      const method =
        (paymentMethod ?? order.paymentMethod ?? 'cash').trim() || 'cash';
      await this.markPaymentReceived(id, restaurantId, userId, method);
    }

    await this.deliveryService.assignDriver(restaurantId, id, { driverId });

    return this.updateStatus(id, restaurantId, userId, {
      status: OrderStatus.DELIVERED,
      notes: 'Despachado desde salón',
    });
  }

  /**
   * Mantiene TableSessionItem.kitchenStatus alineado con la comanda (Order).
   * Sin esto, marcar Listo en cocina deja ítems en SENT y la mesa vuelve a "Cocina".
   */
  private async syncFloorComandaKitchenItemsTx(
    tx: Prisma.TransactionClient,
    order: { id: string; orderSource?: OrderSource | null },
    status: OrderStatus,
  ): Promise<void> {
    if (order.orderSource !== OrderSource.FLOOR_COMANDA) {
      return;
    }

    let itemStatus: ComandaItemStatus | null = null;
    switch (status) {
      case OrderStatus.READY:
        itemStatus = ComandaItemStatus.READY;
        break;
      case OrderStatus.DELIVERED:
        itemStatus = ComandaItemStatus.SERVED;
        break;
      case OrderStatus.CANCELLED:
        itemStatus = ComandaItemStatus.CANCELLED;
        break;
      case OrderStatus.PREPARING:
        itemStatus = ComandaItemStatus.SENT;
        break;
      default:
        return;
    }

    await tx.tableSessionItem.updateMany({
      where: { comandaOrderId: order.id },
      data: { kitchenStatus: itemStatus },
    });
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

  private resolveStatusTransitionSteps(
    currentStatus: OrderStatus,
    targetStatus: OrderStatus,
  ): OrderStatus[] {
    if (currentStatus === targetStatus) {
      return [targetStatus];
    }

    // Aceptar y mandar a cocina: PENDING/PAID → PREPARING pasa por CONFIRMED
    if (
      targetStatus === OrderStatus.PREPARING &&
      (currentStatus === OrderStatus.PENDING ||
        currentStatus === OrderStatus.PAID)
    ) {
      return [OrderStatus.CONFIRMED, OrderStatus.PREPARING];
    }

    return [targetStatus];
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
        OrderStatus.PREPARING,
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

  private async awardLoyaltyPointsForDeliveredOrder(
    order: {
      id: string;
      restaurantId: string;
      customerName: string;
      customerEmail?: string | null;
      customerPhone?: string | null;
      total: number;
    },
    restaurant?: { features?: unknown } | null,
  ) {
    if (!this.isRestaurantFeatureEnabled(restaurant?.features, 'loyalty')) {
      return;
    }

    if (!order.customerEmail) return;

    try {
      await this.loyaltyService.getOrCreateAccount(order.restaurantId, {
        email: order.customerEmail,
        name: order.customerName,
        phone: order.customerPhone || undefined,
      });
      await this.loyaltyService.earnPoints(
        order.restaurantId,
        order.customerEmail,
        order.total,
        order.id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudieron acreditar puntos de fidelización para el pedido ${order.id}: ${message}`,
      );
    }
  }

  private assertOrderTypeAllowed(
    orderType: OrderType,
    features: unknown,
    businessRules: unknown,
  ) {
    const featureFlags =
      features && typeof features === 'object'
        ? (features as Record<string, unknown>)
        : {};
    const rules =
      businessRules && typeof businessRules === 'object'
        ? (businessRules as Record<string, any>)
        : {};

    const pickupEnabled =
      featureFlags.takeaway !== false && rules.pickup?.enabled !== false;
    const deliveryEnabled =
      featureFlags.delivery === true && rules.delivery?.enabled !== false;

    if (orderType === OrderType.PICKUP && !pickupEnabled) {
      throw new BadRequestException(
        'El retiro en local no está habilitado para este restaurante.',
      );
    }

    if (orderType === OrderType.DELIVERY && !deliveryEnabled) {
      throw new BadRequestException(
        'El delivery no está habilitado para este restaurante.',
      );
    }
  }

  private isRestaurantFeatureEnabled(features: unknown, feature: string) {
    return (
      !!features &&
      typeof features === 'object' &&
      (features as Record<string, unknown>)[feature] === true
    );
  }

  private async createCustomerProfileForOrder(
    restaurantId: string,
    customer: { name: string; email?: string | null; phone?: string | null },
  ) {
    try {
      return await this.customersService.upsertProfile(restaurantId, customer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo vincular perfil de cliente para restaurante ${restaurantId}: ${message}`,
      );
      return null;
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
            logo: true,
            branding: true,
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

    const previousPaymentStatus = checkout.paymentStatus;

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
    const customerProfile = checkout.customerProfileId
      ? { id: checkout.customerProfileId }
      : await this.createCustomerProfileForOrder(checkout.restaurantId, {
          name: checkout.customerName,
          email: checkout.customerEmail,
          phone: checkout.customerPhone,
        });

    let createdOrder;
    try {
      createdOrder = await this.prisma.order.create({
        data: {
          id: checkout.id,
          orderNumber: checkout.orderNumber,
          restaurantId: checkout.restaurantId,
          customerProfileId: customerProfile?.id,
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
          deliveryZoneId: checkout.deliveryZoneId,
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
              selectedModifiers: true,
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
    } catch (err) {
      // MercadoPago suele reenviar el mismo evento; si otro worker ya creó la
      // orden entre el findUnique y el create, devolvemos la existente para
      // que el webhook responda 200 y MP no siga reintentando.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.order.findUnique({
          where: { id: checkoutSessionId },
          include: {
            items: { include: { dish: true, selectedModifiers: true } },
            statusHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        });
        if (existing) {
          this.logger.log(
            `Order ${checkoutSessionId} created concurrently by another webhook, returning existing`,
          );
          return existing;
        }
      }
      throw err;
    }

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

    void this.publishOrderCreatedEvent(checkout.restaurantId, createdOrder);

    if (
      (previousPaymentStatus as string) === (PaymentStatus.FAILED as string)
    ) {
      void this.paymentEvents
        .publishPaymentRecovered({
          restaurantId: checkout.restaurantId,
          orderId: createdOrder.id,
          orderNumber: String(createdOrder.orderNumber),
          amount: Number(createdOrder.total),
          checkoutSessionId: checkout.id,
          source: 'orders.service',
        })
        .catch((error) => {
          this.logger.warn(
            `Failed to publish PaymentRecovered for ${createdOrder.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    void this.publishCustomerReturnedIfApplicable(
      checkout.restaurantId,
      customerProfile?.id,
      checkout.customerName,
      createdOrder.id,
    );

    void this.tryInventoryDeduction(createdOrder.id);

    return createdOrder;
  }

  private tryInventoryDeduction(orderId: string): void {
    void this.inventoryConsumption.tryDeductForOrder(orderId).catch((error) => {
      this.logger.warn(
        `Descuento de inventario falló para pedido ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private async createDeliveryOrder(
    orderId: string,
    dto: { deliveryAddress?: string; deliveryNotes?: string },
    delivery: {
      deliveryFee: number;
      zoneId?: string;
      estimatedTime?: string;
    },
    geoContext?: { city?: string; country?: string },
  ) {
    try {
      let geo = geoContext;
      if (!geo?.city && !geo?.country) {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: {
            restaurant: { select: { city: true, country: true } },
          },
        });
        geo = {
          city: order?.restaurant.city,
          country: order?.restaurant.country,
        };
      }

      const coordinates =
        await this.geocodeService.coordinatesForDeliveryAddress(
          dto.deliveryAddress || '',
          geo,
        );

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
          status: 'PENDING',
          ...coordinates,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create DeliveryOrder for order ${orderId}`,
        error,
      );
    }
  }

  private async syncDeliveryOrderForOrderStatus(
    restaurantId: string,
    orderId: string,
    orderStatus: OrderStatus,
  ): Promise<void> {
    const delivery = await this.prisma.deliveryOrder.findUnique({
      where: { orderId },
    });

    if (!delivery) {
      return;
    }

    if (orderStatus === OrderStatus.CANCELLED) {
      if (delivery.status !== 'DELIVERED' && delivery.status !== 'CANCELLED') {
        await this.prisma.deliveryOrder.update({
          where: { id: delivery.id },
          data: { status: 'CANCELLED' },
        });
      }
      return;
    }

    if (orderStatus !== OrderStatus.READY) {
      return;
    }

    if (delivery.status !== 'PENDING') {
      return;
    }

    await this.prisma.deliveryOrder.update({
      where: { id: delivery.id },
      data: {
        status: 'READY',
        readyAt: new Date(),
      },
    });

    await this.deliveryDispatchService.dispatchOrder(restaurantId, orderId);
  }

  buildDecoyPublicOrder(restaurantId: string, createDto: CreateOrderDto) {
    void restaurantId;
    void createDto;
    const decoyToken = crypto.randomBytes(16).toString('hex');
    const now = new Date();

    return {
      order: {
        id: `decoy-${crypto.randomBytes(8).toString('hex')}`,
        orderNumber: `DEC-${now.getTime()}`,
        status: OrderStatus.PENDING,
        publicToken: decoyToken,
        createdAt: now,
      },
      paymentUrl: undefined,
      sandboxPaymentUrl: undefined,
      isSandbox: false,
      publicTrackingToken: decoyToken,
    };
  }

  private parseEstimatedTime(value?: string | null): number | undefined {
    if (!value) return undefined;

    const match = value.match(/(\d+)/);
    if (!match) return undefined;

    return Number(match[1]);
  }

  private publishOrderCreatedEvent(
    restaurantId: string,
    order: {
      id: string;
      orderNumber: string;
      type: string;
      total: number;
      customerName: string;
      items?: unknown[];
    },
  ): void {
    void Promise.resolve(
      this.businessEvents.publish({
        eventType: BentooBusinessEventType.OrderCreated,
        restaurantId,
        source: 'orders.service',
        payload: {
          orderId: order.id,
          orderNumber: String(order.orderNumber),
          type: order.type,
          total: Number(order.total),
          customerName: order.customerName,
          itemCount: Array.isArray(order.items) ? order.items.length : 0,
        },
        correlationId: order.id,
      }),
    ).catch((error) => {
      this.logger.warn(
        `Failed to publish OrderCreated for ${order.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private publishCustomerReturnedIfApplicable(
    restaurantId: string,
    customerProfileId: string | undefined | null,
    customerName: string,
    orderId: string,
  ): void {
    if (!customerProfileId) return;

    void Promise.resolve(
      this.prisma.order.findFirst({
        where: {
          restaurantId,
          customerProfileId,
          id: { not: orderId },
          status: { not: OrderStatus.CANCELLED },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    )
      .then((previous) => {
        if (!previous) return;

        const daysSinceLastOrder = Math.floor(
          (Date.now() - previous.createdAt.getTime()) / 86_400_000,
        );
        if (daysSinceLastOrder < 14) return;

        return this.businessEvents.publishDeduped(
          {
            eventType: BentooBusinessEventType.CustomerReturned,
            restaurantId,
            source: 'orders.service',
            correlationId: `${customerProfileId}:${orderId}`,
            payload: {
              customerProfileId,
              customerName,
              daysSinceLastOrder,
            },
          },
          24 * 60,
        );
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to publish CustomerReturned for ${orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private getBusinessNow(): Date {
    return this.businessClock?.now() ?? new Date();
  }
}
