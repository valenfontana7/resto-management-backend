import { CanActivate, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import request from 'supertest';
import { MercadoPagoModule } from './mercadopago.module';
import { CommonModule } from '../common/common.module';
import { S3Service } from '../storage/s3.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

type CredentialRow = {
  restaurantId: string;
  accessTokenCiphertext: string;
  accessTokenLast4: string | null;
  publishableKey?: string | null;
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
  private checkouts = new Map<string, Record<string, unknown>>();

  seedCheckout(checkout: {
    id: string;
    restaurantId: string;
    publicTrackingToken: string;
    items: Array<{ name: string; quantity: number; unitPrice: number }>;
    isSandbox?: boolean;
    restaurantSlug?: string;
  }) {
    this.checkouts.set(checkout.id, checkout);
  }

  checkoutSession = {
    findUnique: ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { restaurant?: { select?: Record<string, boolean> } };
    }) => {
      const row = this.checkouts.get(where.id);
      if (!row) return null;

      if (include?.restaurant) {
        return {
          ...row,
          restaurant: {
            id: row.restaurantId,
            slug: row.restaurantSlug ?? 'mi-resto',
          },
        };
      }

      return row;
    },
  };

  order = {
    findUnique: () => null,
  };

  mercadoPagoCredential = {
    findUnique: ({
      where,
      select,
    }: {
      where: { restaurantId: string };
      select?: { [K in keyof CredentialRow]?: boolean };
    }) => {
      const row = this.credentials.get(where.restaurantId);
      if (!row) return null;
      if (!select) return row;

      const selected: any = {};
      for (const key of Object.keys(select) as (keyof CredentialRow)[]) {
        if (select[key]) selected[key] = row[key];
      }
      return selected;
    },

    upsert: ({
      where,
      create,
      update,
    }: {
      where: { restaurantId: string };
      create: Omit<CredentialRow, 'createdAt' | 'updatedAt'>;
      update: Partial<Omit<CredentialRow, 'createdAt' | 'updatedAt'>>;
    }) => {
      const existing = this.credentials.get(where.restaurantId);
      const now = new Date();
      if (!existing) {
        const row: CredentialRow = {
          restaurantId: create.restaurantId,
          accessTokenCiphertext: create.accessTokenCiphertext,
          accessTokenLast4: create.accessTokenLast4 ?? null,
          publishableKey: create.publishableKey ?? null,
          isSandbox: !!create.isSandbox,
          createdAt: now,
          updatedAt: now,
        };
        this.credentials.set(where.restaurantId, row);
        return row;
      }

      const merged: CredentialRow = {
        ...existing,
        accessTokenCiphertext:
          update.accessTokenCiphertext ?? existing.accessTokenCiphertext,
        accessTokenLast4: update.accessTokenLast4 ?? existing.accessTokenLast4,
        publishableKey:
          update.publishableKey === undefined
            ? existing.publishableKey
            : update.publishableKey,
        isSandbox:
          typeof update.isSandbox === 'boolean'
            ? update.isSandbox
            : existing.isSandbox,
        updatedAt: now,
      };
      this.credentials.set(where.restaurantId, merged);
      return merged;
    },

    deleteMany: ({ where }: { where: { restaurantId: string } }) => {
      this.credentials.delete(where.restaurantId);
      return { count: 1 };
    },
  };

  restaurant = {
    findUnique: ({
      where,
      select,
    }: {
      where: { slug: string };
      select?: { [K in keyof RestaurantRow]?: boolean };
    }) => {
      const slug = where.slug;
      if (typeof slug !== 'string') return null;

      const row = this.restaurantsBySlug.get(slug);
      if (!row) return null;
      if (!select) return row;

      const selected: any = {};
      for (const key of Object.keys(select) as (keyof RestaurantRow)[]) {
        if (select[key]) selected[key] = row[key];
      }
      return selected;
    },

    create: ({ data }: { data: RestaurantRow }) => {
      const row: RestaurantRow = {
        id: data.id,
        slug: data.slug,
      };
      this.restaurantsBySlug.set(row.slug, row);
      return row;
    },
  };

  webhookEvent = {
    create: ({ data }: { data: { eventKey: string } }) => {
      if (this.webhookKeys.has(data.eventKey)) {
        const err = new Error('Unique constraint failed') as any;
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
  let fetchMock: jest.SpyInstance;

  beforeAll(async () => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const target =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : typeof input === 'object' &&
                  input !== null &&
                  'url' in input &&
                  typeof input.url === 'string'
                ? input.url
                : '';
        if (target.includes('/users/me')) {
          return {
            ok: true,
            json: async () => ({ id: 1 }),
          } as Response;
        }
        if (target.includes('/checkout/preferences')) {
          return {
            ok: true,
            json: async () => ({
              id: 'pref_1',
              init_point: 'https://mp/init',
              sandbox_init_point: 'https://mp/sandbox',
            }),
          } as Response;
        }
        throw new Error(`Unexpected fetch URL in test: ${target}`);
      });

    process.env.MP_TOKEN_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString(
      'base64',
    );
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;

    const moduleBuilder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CacheModule.register({ isGlobal: true }),
        CommonModule,
        MercadoPagoModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: MockAuthGuard }],
    })
      .overrideProvider(S3Service)
      .useValue({
        toClientUrl: (key: string) => key,
        headObject: jest.fn(),
        getObjectStream: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useClass(InMemoryPrisma)
      .overrideProvider(AuthService)
      .useValue({
        validateUser: jest.fn().mockResolvedValue({
          userId: 'u1',
          email: 'u1@test.com',
          role: 'OWNER',
          restaurantId: 'r1',
        }),
      });

    const moduleRef = await moduleBuilder.compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const prisma = app.get(PrismaService);
    await prisma.restaurant.create({
      data: {
        id: 'r1',
        slug: 'mi-resto',
        name: 'Mi Resto',
        type: 'restaurant',
        cuisineTypes: ['argentina'],
        description: 'Test restaurant',
        email: 'test@example.com',
        phone: '+123456789',
        address: 'Test Address',
        city: 'Test City',
        country: 'Argentina',
      },
    });
    prisma.seedCheckout({
      id: 'o1',
      restaurantId: 'r1',
      publicTrackingToken: 'public-token-o1',
      items: [{ name: 'X', quantity: 1, unitPrice: 10 }],
    });
  });

  afterAll(async () => {
    fetchMock?.mockRestore();
    if (app) {
      await app.close();
    }
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
    expect(getRes.body.isSandbox).toBe(false);
    expect(getRes.body.accessTokenLast4).toBe('1234');
    expect(typeof getRes.body.createdAt).toBe('string');
    expect(typeof getRes.body.updatedAt).toBe('string');
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
    expect(getAfter.body).toEqual({
      connected: false,
      connectedVia: null,
      createdAt: null,
      updatedAt: null,
      isSandbox: false,
      accessTokenLast4: null,
      publishableKeyConfigured: false,
      expiresAt: null,
      livemode: null,
      mpUserId: null,
    });
  });

  it('preference validates orderId and rejects unknown checkout', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({ items: [{ title: 'X', quantity: 1, unit_price: 10 }] });

    expect(res1.status).toBe(400);
    expect(res1.body).toEqual({ error: 'orderId es requerido' });

    const res2 = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({
        orderId: 'missing-checkout',
        publicTrackingToken: 'public-token-o1',
      });

    expect(res2.status).toBe(404);
  });

  it('preference missing token => 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .send({
        restaurantId: 'r1',
        orderId: 'o1',
      });

    expect(res.status).toBe(401);
  });

  it('preference success uses fetch (mocked)', async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'GLOBAL_TOKEN';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        restaurantId: 'r1',
        orderId: 'o1',
        publicTrackingToken: 'public-token-o1',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      preference: {
        id: 'pref_1',
        init_point: 'https://mp/init',
        sandbox_init_point: 'https://mp/sandbox',
      },
      isSandbox: false,
    });

    const call = fetchMock.mock.calls.find(([url]) =>
      (typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.toString()
          : ''
      ).includes('/checkout/preferences'),
    );
    expect(call).toBeDefined();

    const options = call![1] as RequestInit;
    const rawBody = options.body;
    const sent = JSON.parse(
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '{}',
    );

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
    expect(sent.auto_return).toBeUndefined();
  });

  it('preference uses tenant token when provided via admin and request only includes slug', async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_SANDBOX_ACCESS_TOKEN;

    const prisma = app.get(PrismaService);
    prisma.seedCheckout({
      id: 'o2',
      restaurantId: 'r1',
      publicTrackingToken: 'public-token-o2',
      items: [{ name: 'X', quantity: 1, unitPrice: 10 }],
      isSandbox: true,
    });

    const postRes = await request(app.getHttpServer())
      .post('/api/mercadopago/tenant-token')
      .send({
        restaurantId: 'r1',
        accessToken: 'TEST-TENANT-TOKEN-1234567890',
        isSandbox: true,
      });

    expect(postRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        orderId: 'o2',
        publicTrackingToken: 'public-token-o2',
        sandbox: true,
      });

    expect(res.status).toBe(200);

    const call = fetchMock.mock.calls.find(
      ([url, options]) =>
        (typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : ''
        ).includes('/checkout/preferences') &&
        String(
          (options as RequestInit)?.headers &&
            typeof (options as RequestInit).headers === 'object' &&
            'Authorization' in (options as RequestInit).headers!
            ? (options as RequestInit).headers!.Authorization
            : '',
        ).includes('TEST-TENANT-TOKEN'),
    );
    expect(call).toBeDefined();

    const options = call![1] as RequestInit;
    const rawBody = options.body;
    const sent = JSON.parse(
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '{}',
    );
    expect(sent.metadata).toEqual({
      slug: 'mi-resto',
      restaurantId: 'r1',
      orderId: 'o2',
    });
  });

  it('preference uses global sandbox token when tenant sandbox missing', async () => {
    const delRes = await request(app.getHttpServer())
      .delete('/api/mercadopago/tenant-token')
      .send({ restaurantId: 'r1' });

    expect(delRes.status).toBe(200);

    const prisma = app.get(PrismaService);
    prisma.seedCheckout({
      id: 'o3',
      restaurantId: 'r1',
      publicTrackingToken: 'public-token-o3',
      items: [{ name: 'X', quantity: 1, unitPrice: 10 }],
      isSandbox: true,
    });

    process.env.MERCADOPAGO_SANDBOX_ACCESS_TOKEN = 'GLOBAL_SANDBOX';

    const res = await request(app.getHttpServer())
      .post('/api/mercadopago/preference')
      .set('Host', 'localhost:3000')
      .send({
        slug: 'mi-resto',
        orderId: 'o3',
        publicTrackingToken: 'public-token-o3',
        sandbox: true,
      });

    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls.find(
      ([url, options]) =>
        (typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : ''
        ).includes('/checkout/preferences') &&
        String(
          (options as RequestInit)?.headers &&
            typeof (options as RequestInit).headers === 'object' &&
            'Authorization' in (options as RequestInit).headers!
            ? (options as RequestInit).headers!.Authorization
            : '',
        ).includes('GLOBAL_SANDBOX'),
    );
    expect(call).toBeDefined();
  });
});
