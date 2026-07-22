import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { AppModule } from '../src/app.module';
import { normalizeTimeline } from '../src/bentoo-lab/core/timeline-normalizer';
import { LabEffectsPolicyService } from '../src/bentoo-lab/effects/lab-effects-policy.service';
import { LabHttpTransport } from '../src/bentoo-lab/http/lab-http.transport';
import { SimulationRuntimeService } from '../src/bentoo-lab/runtime/simulation-runtime.service';
import { SimulationTimelineService } from '../src/bentoo-lab/timeline/simulation-timeline.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bentoo Lab Fase 2 (e2e)', () => {
  let app: INestApplication;
  let runtime: SimulationRuntimeService;
  let timeline: SimulationTimelineService;
  let prisma: PrismaService;
  let effects: LabEffectsPolicyService;
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    app.get(LabHttpTransport).configure(address.port);
    runtime = app.get(SimulationRuntimeService);
    timeline = app.get(SimulationTimelineService);
    prisma = app.get(PrismaService);
    effects = app.get(LabEffectsPolicyService);
  });

  afterAll(async () => {
    for (const runId of createdRunIds.reverse()) {
      await runtime.cleanup(runId, false).catch(() => undefined);
    }
    await app.close();
  });

  it('repite incidentes/stock y cambia con otra clave', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const incidents = ['KITCHEN_DELAY', 'STOCKOUT'] as const;
    const first = await runtime.runHeadless({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-golden-fase2',
      simulatedStartAt,
      incidentCodes: [...incidents],
    });
    createdRunIds.push(first.id);
    const second = await runtime.runHeadless({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-golden-fase2',
      simulatedStartAt,
      incidentCodes: [...incidents],
    });
    createdRunIds.push(second.id);
    const variation = await runtime.runHeadless({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-variation-fase2',
      simulatedStartAt,
      incidentCodes: [...incidents],
    });
    createdRunIds.push(variation.id);

    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: first.restaurantId! },
      select: { slug: true },
    });
    expect(restaurant.slug.startsWith('lab-')).toBe(true);
    expect(first.scenarioVersion).toBe('2.0.0');

    const [firstTimeline, secondTimeline, variationTimeline] = await Promise.all([
      timeline.list(first.id),
      timeline.list(second.id),
      timeline.list(variation.id),
    ]);
    const firstNormalized = normalizeTimeline(firstTimeline, simulatedStartAt);
    const secondNormalized = normalizeTimeline(secondTimeline, simulatedStartAt);
    const variationNormalized = normalizeTimeline(
      variationTimeline,
      simulatedStartAt,
    );

    expect(first.status).toBe('COMPLETED');
    expect(first.simulatedNow.getTime() - simulatedStartAt.getTime()).toBe(
      30 * 60_000,
    );
    expect(firstNormalized).toEqual(secondNormalized);
    expect(variationNormalized).not.toEqual(firstNormalized);
    expect(firstTimeline.filter((event) => event.action === 'order.create')).toHaveLength(5);
    expect(
      firstTimeline.map((event) => event.action),
    ).toEqual(
      expect.arrayContaining([
        'order.preparing',
        'order.ready',
        'order.payment',
        'inventory.consume',
        'incident.kitchen-delay',
        'incident.stockout',
      ]),
    );
    expect(firstTimeline.map((event) => event.sequence)).toEqual(
      firstTimeline.map((_, index) => index + 1),
    );
    for (const event of firstTimeline) {
      expect(event.correlationId.trim().length).toBeGreaterThan(0);
      expect(event.logicalEventId.trim().length).toBeGreaterThan(0);
      expect(event.logicalEntityKey.trim().length).toBeGreaterThan(0);
    }

    expect(first.diagnostics.observedIncidents.map((item) => item.code)).toEqual([
      'KITCHEN_DELAY',
      'STOCKOUT',
    ]);
    expect(first.diagnostics.kitchenDelayMinutes).toBeGreaterThanOrEqual(3);
    expect(first.diagnostics.stockConsumed).toBe(true);
    expect(first.diagnostics.stock.every((item) => item.currentStock >= 0)).toBe(
      true,
    );
    expect(
      first.diagnostics.stock.some((item) => item.currentStock === 0),
    ).toBe(true);

    const deductions = await prisma.orderInventoryDeduction.count({
      where: { restaurantId: first.restaurantId! },
    });
    expect(deductions).toBeGreaterThan(0);

    const readyOrders = await prisma.order.findMany({
      where: { restaurantId: first.restaurantId!, status: 'READY' },
      include: {
        statusHistory: {
          select: { toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    expect(readyOrders.length).toBeGreaterThan(0);
    for (const order of readyOrders) {
      const statuses = order.statusHistory.map((entry) => entry.toStatus);
      expect(statuses).toEqual(
        expect.arrayContaining(['CONFIRMED', 'PREPARING', 'READY']),
      );
    }

    const expectedInvariantKeys = [
      'tenant-scope',
      'order-preparation-causality',
      'authorized-actor-actions',
      'external-effects-blocked',
      'order-state-validity',
      'expected-incidents-once',
      'stock-non-negative',
      'timeline-contiguous',
      'incident-replay-determinism',
    ];
    for (const key of expectedInvariantKeys) {
      expect(first.invariantResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key, status: 'PASS' }),
        ]),
      );
    }
    // GAP-007: 30m permanece “sucio”; no lista NO_OPEN_ORDERS_AT_COMPLETE.
    expect(first.invariantResults).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'no-open-orders-at-complete' }),
      ]),
    );
    expect(second.diagnostics.incidentFingerprint).toBe(
      first.diagnostics.incidentFingerprint,
    );
    expect(
      effects
        .getAttempts()
        .filter(
          (attempt) =>
            attempt.runId === first.id &&
            (attempt.result === 'ALLOWED' || attempt.result === 'EXECUTED'),
        ),
    ).toHaveLength(0);
  });

  it('pausa el reloj y permite entrar como encargado sin detener participantes', async () => {
    const run = await runtime.createRun({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-pause-fase2',
      simulatedStartAt: new Date('2026-07-17T23:00:00.000Z'),
      incidentCodes: ['KITCHEN_DELAY', 'STOCKOUT'],
    });
    createdRunIds.push(run.id);
    await runtime.start(run.id);
    await delay(600);
    const beforeAccess = await runtime.getRun(run.id);
    const access = await runtime.openAsManager(run.id);
    const tokenPayload = decodeJwtPayload(access.token);
    await delay(600);
    const afterAccess = await runtime.getRun(run.id);
    const timelineBeforePause = await timeline.list(run.id);
    const beforePause = await runtime.pause(run.id);
    const persistedBefore = await prisma.simulationRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { seedState: true, runtimeState: true },
    });
    const pendingEventIds = (
      persistedBefore.runtimeState as { queue?: Array<{ id: string }> }
    ).queue?.map((event) => event.id) ?? [];
    await delay(600);
    const whilePaused = await runtime.getRun(run.id);
    const persistedWhilePaused = await prisma.simulationRun.findUniqueOrThrow({
      where: { id: run.id },
      select: { seedState: true, runtimeState: true },
    });

    expect(access.token).toBeTruthy();
    expect(access.restaurantId).toBe(run.restaurantId);
    expect(String(tokenPayload.roleName).toUpperCase()).toBe('MANAGER');
    expect(afterAccess.status).toBe('RUNNING');
    expect(afterAccess.simulatedNow.getTime()).toBeGreaterThan(
      beforeAccess.simulatedNow.getTime(),
    );
    expect(beforePause.status).toBe('PAUSED');
    expect(whilePaused.simulatedNow).toEqual(beforePause.simulatedNow);
    expect(whilePaused.pendingEvents).toBe(beforePause.pendingEvents);
    expect(persistedWhilePaused).toEqual(persistedBefore);

    const resumed = await runtime.resume(run.id);
    expect(resumed.status).toBe('RUNNING');
    await runtime.waitForCompletion(run.id);
    const completed = await runtime.getRun(run.id);
    const finalTimeline = await timeline.list(run.id);
    const finalLogicalIds = new Set(
      finalTimeline.map((event) => event.logicalEventId),
    );
    // Tras reanudar no se pierden eventos pendientes. El orden relativo puede
    // cambiar si un incidente (p. ej. demora) reprograma la cola.
    for (const eventId of pendingEventIds) {
      expect(finalLogicalIds.has(eventId)).toBe(true);
    }
    expect(finalTimeline.length).toBeGreaterThanOrEqual(timelineBeforePause.length);
    expect(completed.status).toBe('COMPLETED');
  }, 180_000);

  it('limpia por completo el tenant sin borrar el diagnóstico del run', async () => {
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-cleanup-fase2',
      simulatedStartAt: new Date('2026-07-17T23:00:00.000Z'),
      incidentCodes: ['STOCKOUT'],
    });
    const restaurantId = run.restaurantId!;
    await runtime.cleanup(run.id, false);

    expect(await prisma.restaurant.count({ where: { id: restaurantId } })).toBe(0);
    expect(await prisma.order.count({ where: { restaurantId } })).toBe(0);
    expect(await prisma.user.count({ where: { restaurantId } })).toBe(0);
    expect(await prisma.dish.count({ where: { restaurantId } })).toBe(0);
    expect(await prisma.category.count({ where: { restaurantId } })).toBe(0);
    expect(await prisma.role.count({ where: { restaurantId } })).toBe(0);
    expect(
      await prisma.restaurantMembership.count({ where: { restaurantId } }),
    ).toBe(0);
    expect(await prisma.inventoryItem.count({ where: { restaurantId } })).toBe(0);
    expect(
      await prisma.orderInventoryDeduction.count({ where: { restaurantId } }),
    ).toBe(0);
    expect(await prisma.simulationRun.count({ where: { id: run.id } })).toBe(1);
    expect(
      await prisma.simulationTimelineEvent.count({ where: { runId: run.id } }),
    ).toBeGreaterThan(0);
  });

  it('ops-core siembra salón y open-as multi-rol', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const created = await runtime.createRun({
      scenarioId: 'pizzeria-30m',
      repetitionKey: 'e2e-ops-core-hitl',
      simulatedStartAt,
      labProfile: 'ops-core',
      incidentCodes: [],
    });
    createdRunIds.push(created.id);

    const restaurantId = created.restaurantId!;
    expect(await prisma.table.count({ where: { restaurantId } })).toBe(8);
    expect(
      await prisma.tableSession.count({
        where: { restaurantId, status: 'OPEN' },
      }),
    ).toBe(2);
    expect(
      await prisma.cashRegisterSession.count({
        where: { restaurantId, status: 'OPEN' },
      }),
    ).toBe(1);
    expect(
      await prisma.user.count({
        where: { restaurantId, role: { name: 'WAITER' } },
      }),
    ).toBe(1);

    const manager = await runtime.openAsRole(created.id, 'manager');
    const kitchen = await runtime.openAsRole(created.id, 'kitchen');
    const waiter = await runtime.openAsRole(created.id, 'waiter');
    const owner = await runtime.openAsRole(created.id, 'owner');
    const chef = await runtime.openAsRole(created.id, 'chef');

    expect(manager.businessDate).toBe('2026-07-17');
    expect(manager.path).toContain('/admin/operacion?date=2026-07-17');
    expect(owner.path).toContain('/admin/operacion?date=2026-07-17');
    expect(kitchen.path).toMatch(/^\/kitchen\/lab-pizzeria-/);
    expect(chef.path).toMatch(/^\/kitchen\/lab-pizzeria-/);
    expect(waiter.path).toContain('/admin/salon?date=2026-07-17');
    expect(decodeJwtPayload(manager.token).sub).toBeTruthy();
    expect(decodeJwtPayload(kitchen.token).sub).toBeTruthy();
    expect(decodeJwtPayload(waiter.token).sub).toBeTruthy();
    expect(decodeJwtPayload(owner.token).sub).toBeTruthy();
    expect(decodeJwtPayload(chef.token).sub).toBeTruthy();
    expect(await prisma.user.count({
      where: { restaurantId, role: { name: 'OWNER' } },
    })).toBe(1);
  });

  it('pizzeria-closeout-10m COMPLETED sin pedidos abiertos', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-closeout-10m',
      repetitionKey: 'e2e-closeout-10m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-closeout-10m');
    expect(run.invariantResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'no-open-orders-at-complete',
          status: 'PASS',
        }),
      ]),
    );

    const openOrders = await prisma.order.count({
      where: {
        restaurantId: run.restaurantId!,
        OR: [
          {
            status: {
              in: ['PENDING', 'PAID', 'CONFIRMED', 'PREPARING', 'READY'],
            },
          },
          {
            paymentStatus: 'PENDING',
            status: { not: 'CANCELLED' },
          },
        ],
      },
    });
    expect(openOrders).toBe(0);

    const deliveredPaid = await prisma.order.count({
      where: {
        restaurantId: run.restaurantId!,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
      },
    });
    expect(deliveredPaid).toBe(2);
  });

  it('pizzeria-salon-split-15m cobro parcial + FACTURA_B', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-salon-split-15m',
      repetitionKey: 'e2e-salon-split-15m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-salon-split-15m');

    const timelineEvents = await timeline.list(run.id);
    const actions = timelineEvents.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'floor.session.open',
        'floor.session.add-items',
        'floor.session.send-kitchen',
        'floor.session.close',
        'fiscal.issue',
        'simulation.complete',
      ]),
    );

    const closeEvents = timelineEvents.filter(
      (event) => event.action === 'floor.session.close',
    );
    expect(closeEvents.length).toBe(2);
    expect(closeEvents.some((event) => event.summary?.includes('parcial'))).toBe(
      true,
    );

    const floorOrders = await prisma.order.findMany({
      where: {
        restaurantId: run.restaurantId!,
        orderSource: 'FLOOR_FINAL',
      },
      select: { id: true, paymentStatus: true, total: true },
    });
    expect(floorOrders).toHaveLength(2);
    expect(floorOrders.every((order) => order.paymentStatus === 'PAID')).toBe(
      true,
    );

    const closedSessions = await prisma.tableSession.count({
      where: {
        restaurantId: run.restaurantId!,
        status: 'CLOSED',
        sessionNumber: { startsWith: 'M-' },
      },
    });
    expect(closedSessions).toBeGreaterThanOrEqual(1);

    const factura = await prisma.fiscalDocument.findFirstOrThrow({
      where: {
        restaurantId: run.restaurantId!,
        type: 'FACTURA_B',
        status: 'AUTHORIZED',
      },
      select: { cae: true, orderId: true },
    });
    expect(factura.cae).toMatch(/^LAB-CAE/);
    expect(floorOrders.some((order) => order.id === factura.orderId)).toBe(true);
  });

  it('pizzeria-salon-10m completa abrir mesa, comanda y cobro', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-salon-10m',
      repetitionKey: 'e2e-salon-10m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-salon-10m');

    const timelineEvents = await timeline.list(run.id);
    const actions = timelineEvents.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'floor.session.open',
        'floor.session.add-items',
        'floor.session.send-kitchen',
        'floor.session.close',
        'simulation.complete',
      ]),
    );

    const closedSessions = await prisma.tableSession.count({
      where: {
        restaurantId: run.restaurantId!,
        status: 'CLOSED',
        sessionNumber: { startsWith: 'M-' },
      },
    });
    // Al menos la sesión del escenario cerró (pueden quedar LAB-S* abiertas del seed)
    expect(closedSessions).toBeGreaterThanOrEqual(1);
  });

  it('pizzeria-ops-15m completa domicilio salón y reserva', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-ops-15m',
      repetitionKey: 'e2e-ops-15m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-ops-15m');

    const timelineEvents = await timeline.list(run.id);
    const actions = timelineEvents.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'delivery.order.create',
        'delivery.order.add-items',
        'reservation.create',
        'simulation.complete',
      ]),
    );

    const deliveryOrders = await prisma.order.count({
      where: {
        restaurantId: run.restaurantId!,
        type: 'DELIVERY',
        orderSource: 'SALON_PHONE',
      },
    });
    expect(deliveryOrders).toBeGreaterThanOrEqual(1);

    const reservations = await prisma.reservation.count({
      where: {
        restaurantId: run.restaurantId!,
        status: 'PENDING',
      },
    });
    // 2 seed + 1 automatizada
    expect(reservations).toBeGreaterThanOrEqual(3);
  });

  it('pizzeria-growth-10m completa cupón, loyalty, review y builder', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-growth-10m',
      repetitionKey: 'e2e-growth-10m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-growth-10m');

    const timelineEvents = await timeline.list(run.id);
    const actions = timelineEvents.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'coupon.validate',
        'order.create',
        'loyalty.enroll',
        'review.create',
        'builder.public.get',
        'simulation.complete',
      ]),
    );

    const couponUsages = await prisma.couponUsage.count({
      where: {
        coupon: {
          restaurantId: run.restaurantId!,
          code: 'LAB10',
        },
      },
    });
    expect(couponUsages).toBeGreaterThanOrEqual(1);

    const loyaltyAccounts = await prisma.loyaltyAccount.count({
      where: {
        restaurantId: run.restaurantId!,
        customerEmail: 'growth@lab.bentoo.invalid',
      },
    });
    expect(loyaltyAccounts).toBe(1);

    const reviews = await prisma.review.count({
      where: {
        restaurantId: run.restaurantId!,
        customerEmail: 'growth@lab.bentoo.invalid',
      },
    });
    expect(reviews).toBeGreaterThanOrEqual(1);

    const publishedBuilder = await prisma.builderConfig.count({
      where: {
        restaurantId: run.restaurantId!,
        isPublished: true,
      },
    });
    expect(publishedBuilder).toBe(1);
  });

  it('pizzeria-payments-15m completa pago online y fiscal mock', async () => {
    const simulatedStartAt = new Date('2026-07-17T23:00:00.000Z');
    const run = await runtime.runHeadless({
      scenarioId: 'pizzeria-payments-15m',
      repetitionKey: 'e2e-payments-15m',
      simulatedStartAt,
      incidentCodes: [],
    });
    createdRunIds.push(run.id);

    expect(run.status).toBe('COMPLETED');
    expect(run.scenarioId).toBe('pizzeria-payments-15m');

    const timelineEvents = await timeline.list(run.id);
    const actions = timelineEvents.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'order.create',
        'payment.approve',
        'fiscal.issue',
        'simulation.complete',
      ]),
    );

    const orderCreatedEvent = timelineEvents.find(
      (event) => event.action === 'order.create',
    );
    expect(orderCreatedEvent?.entityId).toBeTruthy();

    const paidOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderCreatedEvent!.entityId! },
      select: {
        id: true,
        restaurantId: true,
        paymentStatus: true,
      },
    });
    expect(paidOrder.restaurantId).toBe(run.restaurantId);
    expect(paidOrder.paymentStatus).toBe('PAID');

    const fiscalDocument = await prisma.fiscalDocument.findFirstOrThrow({
      where: {
        restaurantId: run.restaurantId!,
        orderId: paidOrder.id,
      },
      select: {
        status: true,
        cae: true,
      },
    });
    expect(fiscalDocument.status).toBe('AUTHORIZED');
    expect(fiscalDocument.cae).toMatch(/^LAB-CAE/);
  });
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Token JWT inválido');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}
