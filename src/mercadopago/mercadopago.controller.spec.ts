import { CanActivate, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { MercadoPagoModule } from './mercadopago.module';
import { PrismaService } from '../prisma/prisma.service';

type CredentialRow = {
  restaurantId: string;
  accessTokenCiphertext: string;
  accessTokenLast4: string | null;
  isSandbox: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RestaurantRow = {
  id: string;
  slug: string;
};

class InMemoryPrisma {
  private credentials = new Map<string, CredentialRow>();
  private webhookKeys = new Set<string>();
  private restaurantsBySlug = new Map<string, RestaurantRow>();

  mercadoPagoCredential = {
    findUnique: async ({ where, select }: any) => {
      const row = this.credentials.get(where.restaurantId);
      if (!row) return null;
      if (!select) return row;

      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (select[key]) selected[key] = (row as any)[key];
      }
      return selected;
    },

    upsert: async ({ where, create, update }: any) => {
      const existing = this.credentials.get(where.restaurantId);
      const now = new Date();
      if (!existing) {
        const row: CredentialRow = {
          restaurantId: create.restaurantId,
          accessTokenCiphertext: create.accessTokenCiphertext,
          accessTokenLast4: create.accessTokenLast4 ?? null,
          isSandbox: !!create.isSandbox,
          createdAt: now,
          updatedAt: now,
        };
        this.credentials.set(where.restaurantId, row);
        return row;
      }

      const merged: CredentialRow = {
        ...existing,
        accessTokenCiphertext: update.accessTokenCiphertext,
        accessTokenLast4: update.accessTokenLast4 ?? null,
        isSandbox:
          typeof update.isSandbox === 'boolean'
            ? update.isSandbox
            : existing.isSandbox,
        updatedAt: now,
      };
      this.credentials.set(where.restaurantId, merged);
      return merged;
    },

    deleteMany: async ({ where }: any) => {
      this.credentials.delete(where.restaurantId);
      return { count: 1 };
    },
  };

  restaurant = {
    findUnique: async ({ where, select }: any) => {
      const slug = where?.slug;
      if (typeof slug !== 'string') return null;

      const row = this.restaurantsBySlug.get(slug);
      if (!row) return null;
      if (!select) return row;

      const selected: any = {};
      for (const key of Object.keys(select)) {
        if (select[key]) selected[key] = (row as any)[key];
      }
      return selected;
    },

    create: async ({ data }: any) => {
      const row: RestaurantRow = {
        id: data.id,
        slug: data.slug,
      };
      this.restaurantsBySlug.set(row.slug, row);
      return row;
    },
  };

  webhookEvent = {
    create: async ({ data }: any) => {
      if (this.webhookKeys.has(data.eventKey)) {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      }
      this.webhookKeys.add(data.eventKey);
      return data;
    },
  };
}

class MockAuthGuard implements CanActivate {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    req.user = {
      userId: 'u1',
      email: 'u1@test.com',
      role: 'OWNER',
      restaurantId: 'r1',
    };
    return true;
  }
}

describe('MercadoPagoController (tenant-token + preference)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString(
      'base64',
    );
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;

    const moduleBuilder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        MercadoPagoModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useClass(InMemoryPrisma);

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.restaurant.create({
      data: {
        id: 'r1',
        slug: 'mi-resto',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST tenant-token missing restaurantId => 400 exact error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/tenant-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'restaurantId es requerido' });
  });

  it('POST -> GET -> DELETE tenant-token flow', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/api/mercadopago/tenant-token')
      .send({ restaurantId: 'r1', accessToken: 'TESTTOKEN_1234' });

    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual({ success: true });

    const getRes = await request(app.getHttpServer())
      .get('/api/mercadopago/tenant-token')
      .query({ restaurantId: 'r1' });

    expect(getRes.status).toBe(200);
    expect(getRes.body.connected).toBe(true);
    expect(typeof getRes.body.createdAt).toBe('string');
    expect(getRes.body.createdAt.length).toBeGreaterThan(0);

    const delRes = await request(app.getHttpServer())
      .delete('/api/mercadopago/tenant-token')
      .send({ restaurantId: 'r1' });

    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({ success: true });

    const getAfter = await request(app.getHttpServer())
      .get('/api/mercadopago/tenant-token')
      .query({ restaurantId: 'r1' });

    expect(getAfter.status).toBe(200);
    expect(getAfter.body).toEqual({ connected: false, createdAt: null });
  });

  it('preference validates orderId/items and does not call MP when invalid', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({ items: [{ title: 'X', quantity: 1, unit_price: 10 }] });

    expect(res1.status).toBe(400);
    expect(res1.body).toEqual({ error: 'orderId es requerido' });

    const res2 = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({
        orderId: 'o1',
        items: [{ title: '', quantity: 1, unit_price: 10 }],
      });

    expect(res2.status).toBe(400);
    expect(res2.body).toEqual({ error: 'items inválidos' });
  });

  it('preference missing token => 400 exact error (no global fallback)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({
        restaurantId: 'r1',
        orderId: 'o1',
        items: [{ title: 'X', quantity: 1, unit_price: 10 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error:
        'MercadoPago no conectado para este restaurante (falta token) y no hay MERCADOPAGO_ACCESS_TOKEN global',
    });
  });

  it('preference success uses fetch (mocked)', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'GLOBAL_TOKEN';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    if (!(global as any).fetch) {
      (global as any).fetch = () => {
        throw new Error('fetch not mocked');
      };
    }

    const fetchMock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pref_1',
        init_point: 'https://mp/init',
        sandbox_init_point: 'https://mp/sandbox',
      }),
    });

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        restaurantId: 'r1',
        orderId: 'o1',
        items: [{ title: 'X', quantity: 2, unit_price: 10 }],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      preference: {
        id: 'pref_1',
        init_point: 'https://mp/init',
        sandbox_init_point: 'https://mp/sandbox',
      },
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api.mercadopago.com/checkout/preferences');

    const options = call[1] as any;
    const sent = JSON.parse(options.body);

    expect(sent.external_reference).toBe('o1');
    expect(sent.items[0].currency_id).toBe('ARS');
    expect(sent.metadata).toEqual({
      slug: 'mi-resto',
      restaurantId: 'r1',
      orderId: 'o1',
    });
    expect(sent.back_urls.success).toBe(
      'http://localhost:3000/mi-resto/order/o1',
    );
    // For http localhost, auto_return should be omitted to avoid MercadoPago rejecting
    expect(sent.auto_return).toBeUndefined();

    fetchMock.mockRestore();
  });

  it('preference uses tenant token when provided via admin and request only includes slug', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_SANDBOX_ACCESS_TOKEN;

    if (!(global as any).fetch) {
      (global as any).fetch = () => {
        throw new Error('fetch not mocked');
      };
    }

    // admin config: set tenant token for restaurant r1
    const postRes = await request(app.getHttpServer())
      .post('/api/mercadopago/tenant-token')
      .send({
        restaurantId: 'r1',
        accessToken: 'TENANT_TOKEN_123',
        isSandbox: true,
      });

    expect(postRes.status).toBe(200);

    const fetchMock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pref_tenant',
        init_point: 'https://mp/init',
        sandbox_init_point: 'https://mp/sandbox',
      }),
    });

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        orderId: 'o2',
        items: [{ title: 'X', quantity: 1, unit_price: 10 }],
        sandbox: true,
      });

    expect(res.status).toBe(200);

    const call = fetchMock.mock.calls[0];
    const options = call[1] as any;
    expect(options.headers.Authorization).toBe('Bearer TENANT_TOKEN_123');

    const sent = JSON.parse(options.body);
    expect(sent.metadata).toEqual({
      slug: 'mi-resto',
      restaurantId: 'r1',
      orderId: 'o2',
    });

    fetchMock.mockRestore();
  });

  it('preference uses global sandbox token when tenant sandbox missing', async () => {
    // ensure no tenant token for r1
    const delRes = await request(app.getHttpServer())
      .delete('/api/mercadopago/tenant-token')
      .send({ restaurantId: 'r1' });

    expect(delRes.status).toBe(200);

    process.env.MERCADOPAGO_SANDBOX_ACCESS_TOKEN = 'GLOBAL_SANDBOX';

    const fetchMock = jest.spyOn(global as any, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'pref_global_sandbox',
        init_point: 'https://mp/init',
        sandbox_init_point: 'https://mp/sandbox',
      }),
    });

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        orderId: 'o3',
        items: [{ title: 'X', quantity: 1, unit_price: 10 }],
        sandbox: true,
      });

    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls[0];
    const options = call[1] as any;
    expect(options.headers.Authorization).toBe('Bearer GLOBAL_SANDBOX');

    fetchMock.mockRestore();
  });
});
