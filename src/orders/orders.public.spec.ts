import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrdersController, PublicOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { EmailService } from '../email/email.service';
import { OrdersGateway } from '../websocket/orders.gateway';
import { ConfigService } from '@nestjs/config';
import { KitchenNotificationsService } from '../kitchen/kitchen-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { OrderAnalyticsService } from './services/order-analytics.service';
import { OrderNotificationsService } from './services/order-notifications.service';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentProviderFactory } from '../payment-providers/payment-provider.factory';
import { DeliveryPricingService } from '../delivery/services/delivery-pricing.service';
import { DeliveryDispatchService } from '../delivery/services/delivery-dispatch.service';
import { DeliveryService } from '../delivery/delivery.service';
import { GeocodeService } from '../delivery/services/geocode.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CustomersService } from '../customers/customers.service';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { InventoryConsumptionService } from '../business-health/inventory-consumption.service';
import { BusinessEventPublisherService } from '../business-events/business-event-publisher.service';
import { PaymentBusinessEventsService } from '../business-events/publishers/payment-business-events.service';
import { OperationalEventEmitter } from '../event-spine/operational-event-emitter.service';

class InMemoryPrisma {
  restaurant = {
    findUnique: ({ where, select }: any) => {
      if (!where?.id) return null;
      const row = {
        id: String(where.id),
        slug: 'mock-resto',
        name: 'Mock Resto',
        email: 'mock@resto.com',
        phone: '123',
        address: 'Mock Address',
      };

      if (!select) return row;
      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (select[key]) selected[key] = (row as any)[key];
      }
      return selected;
    },
  };

  dish = {
    findMany: ({ where }: any) => {
      const ids = where.id.in as string[];
      return ids.map((id) => ({
        id,
        restaurantId: where.restaurantId,
        isAvailable: true,
        price: 1000,
        name: `Dish ${id}`,
      }));
    },
  };

  private orderRow: any = null;
  private checkoutRow: any = null;

  reset() {
    this.orderRow = null;
    this.checkoutRow = null;
  }

  private matchesOrderWhere(where: any = {}) {
    if (!this.orderRow) return false;
    if (where.id && where.id !== this.orderRow.id) return false;
    if (where.restaurantId && where.restaurantId !== this.orderRow.restaurantId)
      return false;
    if (where.status && where.status !== this.orderRow.status) return false;
    if (where.type && where.type !== this.orderRow.type) return false;
    return true;
  }

  order = {
    create: ({ data }: any) => {
      this.orderRow = {
        id: data.id ?? 'o1',
        orderNumber: data.orderNumber,
        restaurantId: data.restaurantId,
        publicTrackingToken: data.publicTrackingToken,
        status: data.status,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        type: data.type,
        subtotal: data.subtotal,
        deliveryFee: data.deliveryFee,
        discount: data.discount ?? 0,
        tip: data.tip,
        total: data.total,
        createdAt: new Date(),
        items: (data.items?.create ?? []).map((it: any) => ({
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          dish: { name: 'Mock Dish' },
        })),
        statusHistory: [],
      };
      return this.orderRow;
    },

    findFirst: ({ where, select }: any) => {
      if (!this.matchesOrderWhere(where)) return null;

      if (!select) return this.orderRow;

      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (!select[key]) continue;
        if (key === 'items') {
          selected.items = this.orderRow.items;
        } else {
          selected[key] = this.orderRow[key];
        }
      }
      return selected;
    },

    findMany: ({ where }: any = {}) =>
      this.matchesOrderWhere(where) ? [this.orderRow] : [],

    count: ({ where }: any = {}) => (this.matchesOrderWhere(where) ? 1 : 0),

    groupBy: ({ where }: any = {}) =>
      this.matchesOrderWhere(where)
        ? [{ status: this.orderRow.status, _count: { id: 1 } }]
        : [],
  };

  checkoutSession = {
    count: () => 0,
    findFirst: ({ where, select }: any) => {
      if (!this.checkoutRow) return null;
      if (where.id !== this.checkoutRow.id) return null;
      if (
        where.restaurantId &&
        where.restaurantId !== this.checkoutRow.restaurantId
      )
        return null;

      if (!select) return this.checkoutRow;

      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (!select[key]) continue;
        if (key === 'restaurant') {
          selected.restaurant = this.checkoutRow.restaurant;
        } else {
          selected[key] = this.checkoutRow[key];
        }
      }
      return selected;
    },
    create: ({ data }: any) => ({
      ...(this.checkoutRow = {
        id: 'checkout-1',
        restaurantId: data.restaurantId,
        orderNumber: data.orderNumber,
        publicTrackingToken: data.publicTrackingToken,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        type: data.type,
        subtotal: data.subtotal,
        deliveryFee: data.deliveryFee,
        discount: data.discount ?? 0,
        tip: data.tip,
        total: data.total,
        createdAt: new Date(),
        paidAt: null,
        items: data.items,
        restaurant: {
          name: 'Mock Resto',
          phone: '123',
          address: 'Mock Address',
        },
      }),
    }),
    update: ({ data }: any) => {
      if (this.checkoutRow) {
        this.checkoutRow = { ...this.checkoutRow, ...data };
      }
      return this.checkoutRow ?? {};
    },
  };
}

describe('Orders public tracking', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let ordersService: OrdersService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController, PublicOrdersController],
      providers: [
        OrdersService,
        // El controller referencia JwtAuthGuard en endpoints admin; para este test
        // lo reemplazamos por un guard dummy (solo testeamos endpoints públicos).
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        // JwtAuthGuard existe como provider (por el decorator), así que aportamos JwtService
        // para evitar errores de DI aunque este test no lo use.
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        {
          provide: OwnershipService,
          useValue: { verifyUserBelongsToRestaurant: jest.fn() },
        },
        {
          provide: MercadoPagoService,
          useValue: {
            createPreference: jest.fn().mockResolvedValue({
              preference: {
                id: 'pref_test',
                init_point: 'https://mp.example/checkout',
                sandbox_init_point: 'https://mp.example/sandbox-checkout',
              },
              isSandbox: false,
            }),
          },
        },
        { provide: EmailService, useValue: {} },
        { provide: OrdersGateway, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: OrderNotificationsService,
          useValue: {
            sendOrderConfirmationEmails: jest.fn(),
            sendStatusUpdateEmail: jest.fn(),
            emitNewOrderCreated: jest.fn(),
            emitOrderUpdate: jest.fn(),
            emitKitchenNotification: jest.fn(),
            emitPaymentConfirmed: jest.fn(),
          },
        },
        { provide: OrderAnalyticsService, useValue: {} },
        {
          provide: CouponsService,
          useValue: {
            validate: jest.fn(),
            incrementUsage: jest.fn(),
          },
        },
        {
          provide: PaymentProviderFactory,
          useValue: { getProvider: jest.fn() },
        },
        {
          provide: DeliveryPricingService,
          useValue: { quoteDelivery: jest.fn() },
        },
        {
          provide: DeliveryDispatchService,
          useValue: { dispatchOrder: jest.fn() },
        },
        {
          provide: DeliveryService,
          useValue: {},
        },
        {
          provide: GeocodeService,
          useValue: { geocodeAddress: jest.fn() },
        },
        {
          provide: LoyaltyService,
          useValue: {
            getOrCreateAccount: jest.fn(),
            earnPoints: jest.fn(),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            upsertProfile: jest
              .fn()
              .mockResolvedValue({ id: 'customer-profile-1' }),
          },
        },
        { provide: KitchenNotificationsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        {
          provide: PrismaService,
          useClass: InMemoryPrisma,
        },
        {
          provide: BotDefenseService,
          useValue: {
            isHoneypotTriggered: jest.fn().mockReturnValue(false),
            applyBotDelayMs: jest.fn(),
            logHoneypotHit: jest.fn(),
          },
        },
        {
          provide: PublicWriteAbuseService,
          useValue: { assertPublicWriteAllowed: jest.fn() },
        },
        {
          provide: InventoryConsumptionService,
          useValue: { deductForOrder: jest.fn() },
        },
        {
          provide: BusinessEventPublisherService,
          useValue: {
            publish: jest.fn().mockResolvedValue(null),
            publishDeduped: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: PaymentBusinessEventsService,
          useValue: { publishPaymentConfirmed: jest.fn() },
        },
        {
          provide: OperationalEventEmitter,
          useValue: { emit: jest.fn().mockResolvedValue('outbox-1') },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Middleware de test: permite simular rol sin auth real.
    app.use((req: any, _res: any, next: any) => {
      if (req?.headers?.['x-test-role'] === 'SUPER_ADMIN') {
        req.user = { userId: 'u1', role: 'SUPER_ADMIN' };
      } else if (req?.headers?.['x-test-role']) {
        req.user = { userId: 'u1', role: String(req.headers['x-test-role']) };
      }
      next();
    });
    await app.init();
    prisma = app.get(PrismaService);
    ordersService = app.get(OrdersService);
  });

  beforeEach(() => {
    prisma.reset();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('create order returns publicTrackingToken and public endpoint requires token', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/restaurants/r1/orders')
      .send({
        customerName: 'A',
        customerPhone: '123',
        type: 'PICKUP',
        // En tests unitarios usamos un método NO-MercadoPago para evitar
        // el flujo de checkoutSession/preference (que se testea por separado).
        paymentMethod: 'cash',
        items: [{ dishId: 'd1', quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    expect(typeof createRes.body.publicTrackingToken).toBe('string');
    expect(createRes.body.publicTrackingToken.length).toBeGreaterThan(10);

    const noTokenRes = await request(app.getHttpServer()).get(
      '/api/restaurants/r1/orders/o1/public',
    );

    expect(noTokenRes.status).toBe(400);

    const okRes = await request(app.getHttpServer())
      .get('/api/restaurants/r1/orders/o1/public')
      .query({ token: createRes.body.publicTrackingToken });

    expect(okRes.status).toBe(200);
    expect(okRes.body.order).toBeDefined();
    expect(okRes.body.order.status).toBeDefined();
    expect(okRes.body.order.total).toBeDefined();
    expect(Array.isArray(okRes.body.order.items)).toBe(true);
    expect(okRes.body.order.customerName).toBeUndefined();
    expect(okRes.body.order.customerPhone).toBeUndefined();

    const okGlobalRes = await request(app.getHttpServer())
      .get('/api/orders/o1/public')
      .query({ token: createRes.body.publicTrackingToken });

    expect(okGlobalRes.status).toBe(200);
    expect(okGlobalRes.body.order).toBeDefined();
    expect(okGlobalRes.body.order.id).toBe('o1');
    expect(okGlobalRes.body.order.status).toBeDefined();
  });

  it('no expone una checkout session pendiente como pedido publico', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/restaurants/r1/orders')
      .send({
        customerName: 'A',
        customerPhone: '123',
        type: 'PICKUP',
        paymentMethod: 'mercadopago',
        items: [{ dishId: 'd1', quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.paymentUrl).toBe('https://mp.example/checkout');
    expect(createRes.body.order.id).toBe('checkout-1');

    const publicRes = await request(app.getHttpServer())
      .get('/api/restaurants/r1/orders/checkout-1/public')
      .query({ token: createRes.body.publicTrackingToken });

    expect(publicRes.status).toBe(404);
  });

  it('no convierte checkout online en pedido aunque la request publica llegue con SUPER_ADMIN', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/restaurants/r1/orders')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({
        customerName: 'Admin',
        customerPhone: '123',
        type: 'PICKUP',
        paymentMethod: 'mercadopago',
        items: [{ dishId: 'd1', quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.paymentUrl).toBe('https://mp.example/checkout');
    expect(createRes.body.order.id).toBe('checkout-1');
    expect(typeof createRes.body.publicTrackingToken).toBe('string');

    const adminList = await ordersService.findAll('r1', 'u1', {} as any);

    expect(adminList.orders).toEqual([]);
    expect(adminList.pagination.total).toBe(0);
  });
});
