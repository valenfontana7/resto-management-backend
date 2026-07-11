import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  TENANCY_PROTECTED_ROUTES,
  TenancyTestHelper,
  type TenancyTestUser,
} from './helpers/tenancy.helper';

/**
 * Suite de tenancy: verifica que endpoints con :restaurantId rechacen cross-tenant.
 *
 * Requiere variables de entorno de test con dos tenants seeded, o skip en CI sin DB:
 *   E2E_TENANT_A_TOKEN, E2E_TENANT_A_RESTAURANT_ID
 *   E2E_TENANT_B_RESTAURANT_ID
 */
describe('Tenancy isolation (e2e)', () => {
  let app: INestApplication<App>;
  let helper: TenancyTestHelper;
  let userA: TenancyTestUser | null = null;
  let restaurantBId: string | null = null;

  beforeAll(async () => {
    const tokenA = process.env.E2E_TENANT_A_TOKEN?.trim();
    const restaurantAId = process.env.E2E_TENANT_A_RESTAURANT_ID?.trim();
    restaurantBId = process.env.E2E_TENANT_B_RESTAURANT_ID?.trim() ?? null;

    if (tokenA && restaurantAId && restaurantBId) {
      userA = {
        token: tokenA,
        restaurantId: restaurantAId,
        userId: process.env.E2E_TENANT_A_USER_ID?.trim() ?? 'test-user-a',
      };
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    helper = new TenancyTestHelper(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Floor fiscal endpoints (P0 gap)', () => {
    it('GET fiscal/documents returns 401 without auth', () => {
      const rid = userA?.restaurantId ?? 'fake-restaurant-id';
      return request(app.getHttpServer())
        .get(`/api/restaurants/${rid}/floor/fiscal/documents`)
        .expect(401);
    });

    it('GET fiscal/documents/:id returns 401 without auth', () => {
      const rid = userA?.restaurantId ?? 'fake-restaurant-id';
      return request(app.getHttpServer())
        .get(`/api/restaurants/${rid}/floor/fiscal/documents/doc-fake`)
        .expect(401);
    });

    it('GET fiscal/documents/:id/pdf returns 401 without auth', () => {
      const rid = userA?.restaurantId ?? 'fake-restaurant-id';
      return request(app.getHttpServer())
        .get(`/api/restaurants/${rid}/floor/fiscal/documents/doc-fake/pdf`)
        .expect(401);
    });
  });

  describe('Cross-tenant matrix', () => {
    if (!userA || !restaurantBId) {
      it.skip('requires E2E_TENANT_* env vars — document routes for manual CI', () => {
        expect(TENANCY_PROTECTED_ROUTES.length).toBeGreaterThan(0);
      });
      return;
    }

    for (const route of TENANCY_PROTECTED_ROUTES) {
      it(`denies ${route.name} for foreign tenant`, async () => {
        await helper.expectCrossTenantDenied(
          userA!,
          restaurantBId!,
          route.method,
          route.path,
        );
      });
    }
  });
});
