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
