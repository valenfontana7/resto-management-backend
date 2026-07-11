import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { App } from 'supertest/types';
// Compilado con `nest build` antes de golden (CI y local).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../dist/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaService } = require('../dist/prisma/prisma.service');
import {
  GOLDEN_FLOWS_ENABLED,
  E2E_INVENTORY_RECIPE_QTY_PER_DISH,
  hydrateGoldenFlowTokens,
  isGoldenFlowDatabaseReady,
  runSalonCashCloseFlow,
  runSalonEqualSplitCloseFlow,
  seedGoldenFlowFixture,
  waitForOrderInventoryDeduction,
  type E2EGoldenFixture,
} from './helpers/e2e-seed.helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { InventoryConsumptionService } = require('../dist/business-health/inventory-consumption.service');

/**
 * Flujos dorados — auth boundaries siempre; flujos reales con DB cuando
 * E2E_GOLDEN_FLOWS=true y DATABASE_URL apunta a una base de test.
 */
describe('Golden flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixture: E2EGoldenFixture | null = null;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    if (GOLDEN_FLOWS_ENABLED && process.env.DATABASE_URL?.trim()) {
      const ready = await isGoldenFlowDatabaseReady(prisma);
      if (ready) {
        const seed = await seedGoldenFlowFixture(prisma);
        fixture = await hydrateGoldenFlowTokens(app.getHttpServer(), seed);
        process.env.E2E_TENANT_A_TOKEN = fixture.tenantA.token;
        process.env.E2E_TENANT_A_RESTAURANT_ID = fixture.tenantA.restaurantId;
        process.env.E2E_TENANT_A_USER_ID = fixture.tenantA.userId;
        process.env.E2E_TENANT_B_RESTAURANT_ID = fixture.tenantB.restaurantId;
      }
    }
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.cleanup();
    }
    await app?.close();
  });

  describe('Auth boundaries', () => {
    it('checkout public orders require restaurant context', async () => {
      await request(app.getHttpServer())
        .post('/api/public/restaurants/fake-id/orders')
        .send({})
        .expect((res) => {
          expect([400, 404, 422]).toContain(res.status);
        });
    });

    it('floor sessions require JWT', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/floor/sessions')
        .expect(401);
    });

    it('subscription create requires JWT', () => {
      return request(app.getHttpServer())
        .post('/api/restaurants/fake-id/subscription')
        .send({ planType: 'STARTER' })
        .expect(401);
    });

    it('edge heartbeat requires edge credentials', () => {
      return request(app.getHttpServer())
        .post('/api/restaurants/fake-id/edge/heartbeat')
        .send({ version: 'e2e' })
        .expect(401);
    });

    it('tenant briefing requires JWT', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/intelligence/briefing')
        .expect(401);
    });

    it('team invite requires JWT', () => {
      return request(app.getHttpServer())
        .post('/api/restaurants/fake-id/team/invites')
        .send({})
        .expect(401);
    });

    it('tenant health 360 requires super admin', () => {
      return request(app.getHttpServer())
        .get('/api/super-admin/tenant-health')
        .expect(401);
    });

    it('fiscal documents list requires JWT', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/floor/fiscal/documents')
        .expect(401);
    });

    it('cash register session requires JWT', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/floor/cash-register/current')
        .expect((res) => {
          expect([401, 404]).toContain(res.status);
        });
    });

    it('delivery platform integrations require JWT', () => {
      return request(app.getHttpServer())
        .post('/api/restaurants/fake-id/integrations/platforms')
        .send({ platform: 'PEDIDOS_YA' })
        .expect(401);
    });

    it('public restaurant resolve requires valid slug', () => {
      return request(app.getHttpServer())
        .get('/api/public/restaurants/resolve/nonexistent-slug-xyz')
        .expect(404);
    });

    it('inventory items list requires JWT', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/inventory-items')
        .expect(401);
    });

    it('business-health dashboard requires JWT', () => {
      return request(app.getHttpServer())
        .get('/api/analytics/restaurant/fake-id/business-health')
        .expect(401);
    });
  });

  describe('Kitchen KDS v2 endpoints', () => {
    it('stations endpoint requires auth', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/kitchen/stations')
        .expect(401);
    });

    it('station-items endpoint requires auth', () => {
      return request(app.getHttpServer())
        .get('/api/restaurants/fake-id/kitchen/station-items')
        .expect(401);
    });
  });

  describe('Decision analytics endpoints', () => {
    it('menu-engineering requires auth', () => {
      return request(app.getHttpServer())
        .get('/api/analytics/restaurant/fake-id/menu-engineering')
        .expect(401);
    });

    it('channel-economics requires auth', () => {
      return request(app.getHttpServer())
        .get('/api/analytics/restaurant/fake-id/channel-economics')
        .expect(401);
    });
  });

  const seededDescribe = GOLDEN_FLOWS_ENABLED ? describe : describe.skip;

  seededDescribe('Seeded salon golden flow', () => {
    it('opens caja → mesa → comanda → cobro en efectivo', async () => {
      if (!fixture) {
        throw new Error(
          'Golden fixture unavailable — run `npx prisma migrate deploy` against test DATABASE_URL',
        );
      }
      const { tenantA } = fixture!;
      const base = `/api/restaurants/${tenantA.restaurantId}/floor`;

      await request(app.getHttpServer())
        .post(`${base}/cash-register/open`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ openingFloat: 10000 })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const openSession = await request(app.getHttpServer())
        .post(`${base}/sessions`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ tableId: tenantA.tableId, guestCount: 2 })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const sessionId = openSession.body.session.id as string;

      await request(app.getHttpServer())
        .post(`${base}/sessions/${sessionId}/items`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          items: [
            {
              dishId: tenantA.dishId,
              quantity: 1,
              sendToKitchen: true,
            },
          ],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const closeRes = await request(app.getHttpServer())
        .post(`${base}/sessions/${sessionId}/close`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ paymentMethod: 'cash' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(closeRes.body.order).toBeDefined();
      expect(closeRes.body.session.status).toBe('CLOSED');

      const outboxEvents = await prisma.operationalOutbox.findMany({
        where: { restaurantId: tenantA.restaurantId },
        orderBy: { createdAt: 'asc' },
      });

      expect(outboxEvents.length).toBeGreaterThan(0);
      const eventTypes = outboxEvents.map((row) => row.eventType);
      expect(eventTypes).toContain('operational.table_session.opened');
      expect(eventTypes).toContain('operational.table_session.closed');
    });

    it('rejects cross-tenant floor access', async () => {
      if (!fixture) return;
      const { tenantA, tenantB } = fixture!;

      await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantB.restaurantId}/floor/sessions`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(403);
    });

    it('creates public order and emits operational outbox row', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const createRes = await request(app.getHttpServer())
        .post(`/api/restaurants/${tenantA.restaurantId}/orders`)
        .send({
          customerName: 'Cliente E2E',
          customerPhone: '1122334455',
          paymentMethod: 'cash',
          type: 'PICKUP',
          items: [
            {
              dishId: tenantA.dishId,
              quantity: 1,
            },
          ],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const orderId = createRes.body.order?.id ?? createRes.body.id;
      expect(orderId).toBeTruthy();

      let outbox = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        outbox = await prisma.operationalOutbox.findFirst({
          where: {
            restaurantId: tenantA.restaurantId,
            aggregateId: orderId,
            eventType: 'operational.order.created',
          },
        });
        if (outbox) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(outbox).toBeTruthy();
    });

    it('opens operational shift and returns La Línea projection', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      await request(app.getHttpServer())
        .post(`/api/restaurants/${tenantA.restaurantId}/operations/shifts/open`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ label: 'E2E turno' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const lineRes = await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantA.restaurantId}/operations/line`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(lineRes.body.shift).toBeTruthy();
      expect(Array.isArray(lineRes.body.items)).toBe(true);
    });

    it('lists floor terminals for multi-PC presence', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const createTerminal = await request(app.getHttpServer())
        .post(`/api/restaurants/${tenantA.restaurantId}/floor/terminals`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ name: 'Caja E2E' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const terminalId = createTerminal.body.terminal.id as string;

      await request(app.getHttpServer())
        .post(`/api/restaurants/${tenantA.restaurantId}/floor/terminals/${terminalId}/ping`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ clientVersion: 'e2e-test' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const listRes = await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantA.restaurantId}/floor/terminals`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(listRes.body.terminals.some((t: { id: string }) => t.id === terminalId)).toBe(
        true,
      );
    });

    it('allows owner to create delivery platform integration (ownership args)', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      await request(app.getHttpServer())
        .post(`/api/restaurants/${tenantA.restaurantId}/integrations/platforms`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ platform: 'PEDIDOS_YA' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantA.restaurantId}/integrations/platforms`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200)
        .expect((res) => {
          expect(
            res.body.some((row: { platform: string }) => row.platform === 'PEDIDOS_YA'),
          ).toBe(true);
        });
    });

    it('logs operational episode when an incident is resolved', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const opsBase = `/api/restaurants/${tenantA.restaurantId}/operations`;

      const incidentRes = await request(app.getHttpServer())
        .post(`${opsBase}/coordinations/declare-incident`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          title: 'E2E incidente horno',
          description: 'Prueba episode log',
          evidenceKeys: ['e2e/evidence/test.jpg'],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const coordinationId =
        incidentRes.body.coordination?.id ?? incidentRes.body.id;
      expect(coordinationId).toBeTruthy();

      await request(app.getHttpServer())
        .post(`${opsBase}/coordinations/${coordinationId}/resolve`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          summary: 'Resuelto en prueba E2E',
          outcome: 'RESOLVED',
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const episode = await prisma.operationalEpisode.findFirst({
        where: {
          restaurantId: tenantA.restaurantId,
          coordinationId,
        },
      });

      expect(episode).toBeTruthy();
      expect(episode?.coordinationType).toBe('INCIDENT');
    });

    it('returns server briefing with memory projections', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const res = await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantA.restaurantId}/intelligence/briefing`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(res.body.source).toBe('server');
      expect(Array.isArray(res.body.recommendations)).toBe(true);
      expect(Array.isArray(res.body.patterns)).toBe(true);
      expect(Array.isArray(res.body.recentEpisodes)).toBe(true);
    });

    it('returns menu engineering and channel economics for owner', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const menuRes = await request(app.getHttpServer())
        .get(
          `/api/analytics/restaurant/${tenantA.restaurantId}/menu-engineering`,
        )
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(Array.isArray(menuRes.body)).toBe(true);

      const channelRes = await request(app.getHttpServer())
        .get(
          `/api/analytics/restaurant/${tenantA.restaurantId}/channel-economics`,
        )
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(Array.isArray(channelRes.body)).toBe(true);
      if (channelRes.body.length > 0) {
        expect(channelRes.body[0]).toHaveProperty('channelLabel');
      }
    });
  });

  seededDescribe('Seeded tenant health 360', () => {
    it('rejects tenant health for non-super-admin', async () => {
      if (!fixture) return;
      await request(app.getHttpServer())
        .get('/api/super-admin/tenant-health')
        .set('Authorization', `Bearer ${fixture.tenantA.token}`)
        .expect(403);
    });

    it('lists health 360 with summary and structured playbooks', async () => {
      if (!fixture) return;
      const { tenantA, superAdmin } = fixture!;

      const res = await request(app.getHttpServer())
        .get('/api/super-admin/tenant-health?limit=50&sort=score_desc')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.total).toBeGreaterThan(0);
      expect(res.body.summary.byBand).toMatchObject({
        healthy: expect.any(Number),
        attention: expect.any(Number),
        at_risk: expect.any(Number),
        critical: expect.any(Number),
      });
      expect(Array.isArray(res.body.tenants)).toBe(true);

      const row = res.body.tenants.find(
        (item: { restaurantId: string }) =>
          item.restaurantId === tenantA.restaurantId,
      );
      expect(row).toBeDefined();
      expect(row.healthScore).toBeGreaterThanOrEqual(0);
      expect(row.playbook).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        steps: expect.any(Array),
        actions: expect.any(Array),
      });
      expect(row.playbook.actions.length).toBeGreaterThan(0);
    });

    it('returns single tenant health by restaurant id', async () => {
      if (!fixture) return;
      const { tenantA, superAdmin } = fixture!;

      const res = await request(app.getHttpServer())
        .get(`/api/super-admin/tenant-health/${tenantA.restaurantId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .expect(200);

      expect(res.body.restaurantId).toBe(tenantA.restaurantId);
      expect(res.body.playbook.id).toBeTruthy();
    });
  });

  seededDescribe('Seeded fiscal golden flow', () => {
    it('issues INTERNAL_TICKET for a paid salon order', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const { orderId } = await runSalonCashCloseFlow(
        app.getHttpServer(),
        tenantA,
      );
      const fiscalBase = `/api/restaurants/${tenantA.restaurantId}/floor/fiscal`;

      const issueRes = await request(app.getHttpServer())
        .post(`${fiscalBase}/orders/${orderId}/issue`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ type: 'INTERNAL_TICKET' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(issueRes.body.status).toBe('AUTHORIZED');
      expect(issueRes.body.type).toBe('INTERNAL_TICKET');

      const listRes = await request(app.getHttpServer())
        .get(`${fiscalBase}/documents`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(
        listRes.body.some(
          (doc: { orderId?: string | null; type: string }) =>
            doc.orderId === orderId && doc.type === 'INTERNAL_TICKET',
        ),
      ).toBe(true);

      const documentId = issueRes.body.id as string;
      const pdfRes = await request(app.getHttpServer())
        .get(`${fiscalBase}/documents/${documentId}/pdf`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);
      expect(pdfRes.body.slice(0, 5).toString('utf8')).toBe('%PDF-');
    });

    it('downloads FACTURA_B PDF with CAE for authorized document', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const { orderId } = await runSalonCashCloseFlow(
        app.getHttpServer(),
        tenantA,
      );
      const fiscalBase = `/api/restaurants/${tenantA.restaurantId}/floor/fiscal`;

      await prisma.restaurant.update({
        where: { id: tenantA.restaurantId },
        data: { taxId: '30712345678' },
      });

      const fiscalDoc = await prisma.fiscalDocument.create({
        data: {
          restaurantId: tenantA.restaurantId,
          orderId,
          type: 'FACTURA_B',
          status: 'AUTHORIZED',
          subtotal: 5000,
          ivaAmount: 1050,
          total: 6050,
          cae: '71234567890123',
          caeExpiresAt: new Date('2026-12-31'),
          puntoVenta: 1,
          numero: 42,
          customerName: 'Cliente E2E',
        },
      });

      const pdfRes = await request(app.getHttpServer())
        .get(`${fiscalBase}/documents/${fiscalDoc.id}/pdf`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .buffer()
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);
      expect(pdfRes.body.slice(0, 5).toString('utf8')).toBe('%PDF-');
      expect(
        String(pdfRes.headers['content-disposition'] ?? ''),
      ).toMatch(/comprobante-factura_b/i);
    });

    it('rejects cross-tenant fiscal document access', async () => {
      if (!fixture) return;
      const { tenantA, tenantB } = fixture!;

      await request(app.getHttpServer())
        .get(
          `/api/restaurants/${tenantB.restaurantId}/floor/fiscal/documents`,
        )
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(403);
    });
  });

  seededDescribe('Seeded subscription golden flow', () => {
    it('creates STARTER subscription, reads summary and upgrades plan', async () => {
      if (!fixture) return;
      const { tenantB } = fixture!;
      const subBase = `/api/restaurants/${tenantB.restaurantId}/subscription`;

      const createRes = await request(app.getHttpServer())
        .post(subBase)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ planType: 'STARTER' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(createRes.body.subscription).toBeDefined();
      expect(createRes.body.subscription.planId).toBe('STARTER');
      expect(['TRIALING', 'ACTIVE']).toContain(
        createRes.body.subscription.status,
      );

      const getRes = await request(app.getHttpServer())
        .get(subBase)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);

      expect(getRes.body.subscription.planId).toBe('STARTER');

      const summaryRes = await request(app.getHttpServer())
        .get(`${subBase}/summary`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .expect(200);

      expect(summaryRes.body.subscription).toBeTruthy();
      expect(summaryRes.body.subscription.planId).toBe('STARTER');

      const upgradeRes = await request(app.getHttpServer())
        .patch(`${subBase}/upgrade`)
        .set('Authorization', `Bearer ${tenantB.token}`)
        .send({ newPlanId: 'PROFESSIONAL' })
        .expect(200);

      expect(upgradeRes.body.subscription.planId).toBe('PROFESSIONAL');
    });

    it('rejects cross-tenant subscription access', async () => {
      if (!fixture) return;
      const { tenantA, tenantB } = fixture!;

      await request(app.getHttpServer())
        .get(`/api/restaurants/${tenantB.restaurantId}/subscription`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(403);
    });
  });

  seededDescribe('Seeded edge-sync golden flow', () => {
    it('register → heartbeat → pull → admin status', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const edgeBase = `/api/restaurants/${tenantA.restaurantId}/edge`;

      const registerRes = await request(app.getHttpServer())
        .post(`${edgeBase}/register`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          hostname: 'e2e-local',
          version: '0.0.0-e2e',
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const localId = registerRes.body.localId as string;
      const edgeSyncToken = registerRes.body.edgeSyncToken as string;
      expect(localId).toBeTruthy();
      expect(edgeSyncToken).toBeTruthy();

      await request(app.getHttpServer())
        .post(`${edgeBase}/heartbeat`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .send({ version: '0.0.0-e2e', lanUrl: 'http://127.0.0.1:4000' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const pullRes = await request(app.getHttpServer())
        .get(`${edgeBase}/sync/pull`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .query({ streams: 'menu,tables' })
        .expect(200);

      expect(pullRes.body.streams).toBeDefined();
      expect(pullRes.body.streams.menu).toBeDefined();
      expect(pullRes.body.streams.tables).toBeDefined();

      const statusRes = await request(app.getHttpServer())
        .get(`${edgeBase}/sync/status`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(statusRes.body.localId).toBe(localId);
      expect(statusRes.body.status).toBe('ACTIVE');
    });

    it('push OPEN_SESSION + ADD_ITEMS applies salon mutations in cloud', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const edgeBase = `/api/restaurants/${tenantA.restaurantId}/edge`;

      const registerRes = await request(app.getHttpServer())
        .post(`${edgeBase}/register`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ hostname: 'e2e-push', version: '0.0.0-e2e' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const localId = registerRes.body.localId as string;
      const edgeSyncToken = registerRes.body.edgeSyncToken as string;

      await prisma.tableSession.updateMany({
        where: {
          restaurantId: tenantA.restaurantId,
          tableId: tenantA.tableId,
          status: 'OPEN',
        },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await prisma.table.update({
        where: { id: tenantA.tableId },
        data: { currentSessionId: null, status: 'AVAILABLE' },
      });

      const openMutationId = `e2e-edge-open-${Date.now()}`;
      const pushOpenRes = await request(app.getHttpServer())
        .post(`${edgeBase}/sync/push`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .send({
          mutations: [
            {
              clientMutationId: openMutationId,
              entityType: 'OPEN_SESSION',
              payload: {
                tableId: tenantA.tableId,
                guestCount: 2,
                userId: tenantA.userId,
              },
            },
          ],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(pushOpenRes.body.accepted).toContain(openMutationId);
      expect(pushOpenRes.body.rejected ?? []).toHaveLength(0);

      const openSession = await prisma.tableSession.findFirst({
        where: {
          restaurantId: tenantA.restaurantId,
          tableId: tenantA.tableId,
          status: 'OPEN',
        },
        include: { items: true },
      });
      expect(openSession).toBeTruthy();

      const addMutationId = `e2e-edge-add-${Date.now()}`;
      const pushAddRes = await request(app.getHttpServer())
        .post(`${edgeBase}/sync/push`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .send({
          mutations: [
            {
              clientMutationId: addMutationId,
              entityType: 'ADD_ITEMS',
              payload: {
                sessionId: openSession!.id,
                body: {
                  items: [
                    {
                      dishId: tenantA.dishId,
                      quantity: 1,
                      sendToKitchen: true,
                    },
                  ],
                },
              },
            },
          ],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(pushAddRes.body.accepted).toContain(addMutationId);

      const sessionWithItems = await prisma.tableSession.findUnique({
        where: { id: openSession!.id },
        include: { items: true },
      });
      expect(sessionWithItems?.items.length).toBeGreaterThan(0);

      await prisma.tableSession.update({
        where: { id: openSession!.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await prisma.table.update({
        where: { id: tenantA.tableId },
        data: { currentSessionId: null, status: 'AVAILABLE' },
      });
    });

    it('pull floor_sessions devuelve sesiones OPEN de cloud', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;
      const edgeBase = `/api/restaurants/${tenantA.restaurantId}/edge`;
      const floorBase = `/api/restaurants/${tenantA.restaurantId}/floor`;

      await prisma.tableSession.updateMany({
        where: {
          restaurantId: tenantA.restaurantId,
          tableId: tenantA.tableId,
          status: 'OPEN',
        },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await prisma.table.update({
        where: { id: tenantA.tableId },
        data: { currentSessionId: null, status: 'AVAILABLE' },
      });

      const openRes = await request(app.getHttpServer())
        .post(`${floorBase}/sessions`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ tableId: tenantA.tableId, guestCount: 2 })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const sessionId = openRes.body.session.id as string;
      expect(sessionId).toBeTruthy();

      await request(app.getHttpServer())
        .post(`${floorBase}/sessions/${sessionId}/items`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({
          items: [
            {
              dishId: tenantA.dishId,
              quantity: 1,
              sendToKitchen: false,
            },
          ],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const registerRes = await request(app.getHttpServer())
        .post(`${edgeBase}/register`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .send({ hostname: 'e2e-pull-sessions', version: 'salon-local-win7' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const localId = registerRes.body.localId as string;
      const edgeSyncToken = registerRes.body.edgeSyncToken as string;

      await request(app.getHttpServer())
        .post(`${edgeBase}/heartbeat`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .send({
          version: 'salon-local-win7',
          lanUrl: 'http://192.168.1.10:4100',
          hostname: 'CAJA-E2E',
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const pullRes = await request(app.getHttpServer())
        .get(`${edgeBase}/sync/pull`)
        .set('Authorization', `Bearer ${edgeSyncToken}`)
        .set('x-bentoo-local-id', localId)
        .query({ streams: 'floor_sessions' })
        .expect(200);

      const sessions = pullRes.body.streams?.floor_sessions?.items as Array<{
        id: string;
        status: string;
        items?: unknown[];
      }>;
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.some((row) => row.id === sessionId && row.status === 'OPEN')).toBe(
        true,
      );

      const pulled = sessions.find((row) => row.id === sessionId);
      expect(pulled?.items?.length).toBeGreaterThan(0);

      const statusRes = await request(app.getHttpServer())
        .get(`${edgeBase}/sync/status`)
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(statusRes.body.isStale).toBe(false);
      expect(statusRes.body.lastHeartbeatAt).toBeTruthy();

      await prisma.tableSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      await prisma.table.update({
        where: { id: tenantA.tableId },
        data: { currentSessionId: null, status: 'AVAILABLE' },
      });
    });
  });

  seededDescribe('Seeded inventory golden flow', () => {
    it('deducts BOM stock after salon cash close and is idempotent', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const stockBefore = await prisma.inventoryItem.findUnique({
        where: { id: tenantA.inventoryItemId },
        select: { currentStock: true },
      });
      expect(stockBefore?.currentStock).toBeGreaterThanOrEqual(
        E2E_INVENTORY_RECIPE_QTY_PER_DISH,
      );

      const { orderId } = await runSalonCashCloseFlow(
        app.getHttpServer(),
        tenantA,
      );

      await waitForOrderInventoryDeduction(prisma, orderId);

      const stockAfter = await prisma.inventoryItem.findUnique({
        where: { id: tenantA.inventoryItemId },
        select: { currentStock: true },
      });
      expect(stockAfter?.currentStock).toBe(
        (stockBefore?.currentStock ?? 0) - E2E_INVENTORY_RECIPE_QTY_PER_DISH,
      );

      const deduction = await prisma.orderInventoryDeduction.findUnique({
        where: { orderId },
      });
      expect(deduction?.restaurantId).toBe(tenantA.restaurantId);

      const consumption = app.get(InventoryConsumptionService);
      const retry = await consumption.tryDeductForOrder(orderId);
      expect(retry.deducted).toBe(false);
      expect(retry.reason).toBe('already_deducted');

      const healthRes = await request(app.getHttpServer())
        .get(
          `/api/analytics/restaurant/${tenantA.restaurantId}/business-health`,
        )
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(200);

      expect(healthRes.body.inventory?.settings?.autoDeductOnSale).not.toBe(
        false,
      );
      expect(healthRes.body.inventory?.totalItems).toBeGreaterThanOrEqual(1);
    });

    it('rejects cross-tenant inventory access', async () => {
      if (!fixture) return;
      const { tenantA, tenantB } = fixture!;

      await request(app.getHttpServer())
        .get(
          `/api/restaurants/${tenantB.restaurantId}/inventory-items`,
        )
        .set('Authorization', `Bearer ${tenantA.token}`)
        .expect(403);
    });
  });

  seededDescribe('Seeded salon equal split golden flow', () => {
    it('equal split cobra en partes y cierra mesa al último pago', async () => {
      if (!fixture) return;
      const { tenantA } = fixture!;

      const { sessionId, orderIds } = await runSalonEqualSplitCloseFlow(
        app.getHttpServer(),
        tenantA,
        2,
        3,
      );

      expect(orderIds).toHaveLength(2);

      const sessionRow = await prisma.tableSession.findUnique({
        where: { id: sessionId },
        include: { items: true },
      });

      expect(sessionRow?.status).toBe('CLOSED');
      expect(sessionRow?.items.every((item) => item.paidInOrderId != null)).toBe(
        true,
      );
      expect(new Set(sessionRow?.items.map((item) => item.paidInOrderId))).toEqual(
        new Set(orderIds),
      );
    });
  });
});
