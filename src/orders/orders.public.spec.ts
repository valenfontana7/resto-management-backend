import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

class InMemoryPrisma {
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

  order = {
    create: ({ data }: any) => {
      this.orderRow = {
        id: 'o1',
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
      if (!this.orderRow) return null;
      if (where.id !== this.orderRow.id) return null;
      if (where.restaurantId !== this.orderRow.restaurantId) return null;

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
  };
}

describe('Orders public tracking', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useClass: InMemoryPrisma,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('create order returns publicTrackingToken and public endpoint requires token', async () => {
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
  });
});
