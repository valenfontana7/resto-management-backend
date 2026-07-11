import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

export interface TenancyTestUser {
  token: string;
  restaurantId: string;
  userId: string;
}

/**
 * Helper para tests e2e de multi-tenancy.
 * Requiere seeds o fixtures que creen dos restaurantes con usuarios distintos.
 */
export class TenancyTestHelper {
  constructor(private readonly app: INestApplication<App>) {}

  /** Espera 403 cuando el JWT de userA accede a recursos de restaurantB */
  async expectCrossTenantDenied(
    userA: TenancyTestUser,
    restaurantBId: string,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
  ): Promise<void> {
    const agent = request(this.app.getHttpServer())
      [method](path.replace(':restaurantId', restaurantBId))
      .set('Authorization', `Bearer ${userA.token}`);

    await agent.expect(403);
  }

  /** Espera 200/201 cuando el usuario accede a su propio restaurante */
  async expectOwnTenantAllowed(
    user: TenancyTestUser,
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    expectedStatus = 200,
  ): Promise<void> {
    const agent = request(this.app.getHttpServer())
      [method](path.replace(':restaurantId', user.restaurantId))
      .set('Authorization', `Bearer ${user.token}`);

    await agent.expect(expectedStatus);
  }
}

/** Endpoints críticos con param restaurantId que deben rechazar cross-tenant */
export const TENANCY_PROTECTED_ROUTES = [
  {
    name: 'floor fiscal documents list',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/floor/fiscal/documents',
    expectedOwnStatus: 200,
  },
  {
    name: 'floor sessions list',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/floor/sessions',
    expectedOwnStatus: 200,
  },
  {
    name: 'kitchen orders',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/kitchen/orders',
    expectedOwnStatus: 200,
  },
  {
    name: 'operations shift current',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/operations/shifts/current',
    expectedOwnStatus: 200,
  },
  {
    name: 'kitchen stations',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/kitchen/stations',
    expectedOwnStatus: 200,
  },
  {
    name: 'kitchen station items',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/kitchen/station-items',
    expectedOwnStatus: 200,
  },
  {
    name: 'team invites list',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/team/invites',
    expectedOwnStatus: 200,
  },
  {
    name: 'intelligence briefing',
    method: 'get' as const,
    path: '/api/restaurants/:restaurantId/intelligence/briefing',
    expectedOwnStatus: 200,
  },
  {
    name: 'decision menu engineering',
    method: 'get' as const,
    path: '/api/analytics/restaurant/:restaurantId/menu-engineering',
    expectedOwnStatus: 200,
  },
  {
    name: 'decision channel economics',
    method: 'get' as const,
    path: '/api/analytics/restaurant/:restaurantId/channel-economics',
    expectedOwnStatus: 200,
  },
] as const;
