import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeTimeline } from '../core/timeline-normalizer';
import { LabEffectsPolicyService } from '../effects/lab-effects-policy.service';
import { buildIncidentFingerprint } from '../incidents/incident-fingerprint';
import { LabIncidentCode } from '../incidents/lab-incident.types';
import { PersistedSimulationRuntimeState } from '../runtime/simulation-runtime.types';
import { LabScenarioInvariantKey } from '../scenarios/scenario.types';

function asRuntimeState(
  value: Prisma.JsonValue | null | undefined,
): PersistedSimulationRuntimeState {
  return (value ?? {}) as unknown as PersistedSimulationRuntimeState;
}

export type InvariantStatus = 'PASS' | 'FAIL' | 'ERROR';

export type SimulationInvariantKey =
  | 'tenant-scope'
  | 'order-preparation-causality'
  | 'authorized-actor-actions'
  | 'external-effects-blocked'
  | 'order-state-validity'
  | 'expected-incidents-once'
  | 'stock-non-negative'
  | 'timeline-contiguous'
  | 'incident-replay-determinism'
  | 'no-open-orders-at-complete';

export interface SimulationInvariantResult {
  key: SimulationInvariantKey;
  status: InvariantStatus;
  detail: string;
}

const ALL_SCENARIO_INVARIANT_KEYS: readonly LabScenarioInvariantKey[] = [
  'TENANT_SCOPE',
  'ORDER_PREPARATION_CAUSALITY',
  'AUTHORIZED_ACTOR_ACTIONS',
  'EXTERNAL_EFFECTS_BLOCKED',
  'ORDER_STATE_VALIDITY',
  'EXPECTED_INCIDENTS_ONCE',
  'STOCK_NON_NEGATIVE',
  'TIMELINE_CONTIGUOUS',
  'INCIDENT_REPLAY_DETERMINISM',
  'NO_OPEN_ORDERS_AT_COMPLETE',
] as const;

const OPEN_KITCHEN_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'CONFIRMED', 'CANCELLED'],
  PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const ONLINE_MUTATION_ACTIONS = [
  'order.create',
  'order.preparing',
  'order.ready',
  'order.delivered',
  'order.payment',
  'inventory.consume',
  'incident.kitchen-delay',
  'incident.stockout',
] as const;

const FLOOR_MUTATION_ACTIONS = [
  'floor.session.open',
  'floor.session.add-items',
  'floor.session.send-kitchen',
  'floor.session.close',
  'floor.session.merge-tables',
] as const;

const DELIVERY_MUTATION_ACTIONS = [
  'delivery.order.create',
  'delivery.order.add-items',
] as const;

const PAYMENT_MUTATION_ACTIONS = ['payment.approve'] as const;

const FISCAL_MUTATION_ACTIONS = ['fiscal.issue'] as const;

const RESERVATION_MUTATION_ACTIONS = ['reservation.create'] as const;

const GROWTH_MUTATION_ACTIONS = [
  'coupon.validate',
  'loyalty.enroll',
  'review.create',
  'builder.public.get',
] as const;

@Injectable()
export class SimulationInvariantRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: LabEffectsPolicyService,
  ) {}

  async evaluate(
    runId: string,
    scenarioKeys?: readonly LabScenarioInvariantKey[],
  ): Promise<SimulationInvariantResult[]> {
    const keys = scenarioKeys?.length
      ? scenarioKeys
      : ALL_SCENARIO_INVARIANT_KEYS;
    const results: SimulationInvariantResult[] = [];
    for (const key of keys) {
      try {
        results.push(await this.evaluateByScenarioKey(runId, key));
      } catch (error) {
        results.push({
          key: this.toResultKey(key),
          status: 'ERROR',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  private evaluateByScenarioKey(
    runId: string,
    key: LabScenarioInvariantKey,
  ): Promise<SimulationInvariantResult> | SimulationInvariantResult {
    switch (key) {
      case 'TENANT_SCOPE':
        return this.evaluateTenantScope(runId);
      case 'ORDER_PREPARATION_CAUSALITY':
        return this.evaluateOrderCausality(runId);
      case 'AUTHORIZED_ACTOR_ACTIONS':
        return this.evaluateAuthorizedActions(runId);
      case 'EXTERNAL_EFFECTS_BLOCKED':
        return this.evaluateExternalEffects(runId);
      case 'ORDER_STATE_VALIDITY':
        return this.evaluateOrderStateValidity(runId);
      case 'EXPECTED_INCIDENTS_ONCE':
        return this.evaluateExpectedIncidentsOnce(runId);
      case 'STOCK_NON_NEGATIVE':
        return this.evaluateStockNonNegative(runId);
      case 'TIMELINE_CONTIGUOUS':
        return this.evaluateTimelineContiguous(runId);
      case 'INCIDENT_REPLAY_DETERMINISM':
        return this.evaluateIncidentReplayDeterminism(runId);
      case 'NO_OPEN_ORDERS_AT_COMPLETE':
        return this.evaluateNoOpenOrdersAtComplete(runId);
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  }

  private toResultKey(key: LabScenarioInvariantKey): SimulationInvariantKey {
    switch (key) {
      case 'TENANT_SCOPE':
        return 'tenant-scope';
      case 'ORDER_PREPARATION_CAUSALITY':
        return 'order-preparation-causality';
      case 'AUTHORIZED_ACTOR_ACTIONS':
        return 'authorized-actor-actions';
      case 'EXTERNAL_EFFECTS_BLOCKED':
        return 'external-effects-blocked';
      case 'ORDER_STATE_VALIDITY':
        return 'order-state-validity';
      case 'EXPECTED_INCIDENTS_ONCE':
        return 'expected-incidents-once';
      case 'STOCK_NON_NEGATIVE':
        return 'stock-non-negative';
      case 'TIMELINE_CONTIGUOUS':
        return 'timeline-contiguous';
      case 'INCIDENT_REPLAY_DETERMINISM':
        return 'incident-replay-determinism';
      case 'NO_OPEN_ORDERS_AT_COMPLETE':
        return 'no-open-orders-at-complete';
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  }

  private async evaluateNoOpenOrdersAtComplete(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { restaurantId: true },
    });
    if (!run.restaurantId) {
      return {
        key: 'no-open-orders-at-complete',
        status: 'FAIL',
        detail: 'Sin restaurante para evaluar pedidos abiertos',
      };
    }
    const openOrders = await this.prisma.order.findMany({
      where: {
        restaurantId: run.restaurantId,
        OR: [
          { status: { in: [...OPEN_KITCHEN_STATUSES] } },
          {
            paymentStatus: 'PENDING',
            status: { not: OrderStatus.CANCELLED },
          },
        ],
      },
      select: { id: true, status: true, paymentStatus: true },
      take: 10,
    });
    if (openOrders.length === 0) {
      return {
        key: 'no-open-orders-at-complete',
        status: 'PASS',
        detail: 'Sin pedidos abiertos ni impagos al complete',
      };
    }
    const sample = openOrders
      .map((order) => `${order.id}:${order.status}/${order.paymentStatus}`)
      .join(', ');
    return {
      key: 'no-open-orders-at-complete',
      status: 'FAIL',
      detail: `${openOrders.length}+ pedidos abiertos/impagos (sample: ${sample})`,
    };
  }

  private async evaluateTenantScope(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { restaurantId: true },
    });
    if (!run.restaurantId) {
      return {
        key: 'tenant-scope',
        status: 'FAIL',
        detail: 'La ejecución no tiene restaurante aislado',
      };
    }
    const timeline = await this.prisma.simulationTimelineEvent.findMany({
      where: { runId, entityType: 'Order', entityId: { not: null } },
      select: { entityId: true },
    });
    const orderIds = [
      ...new Set(
        timeline
          .map((event) => event.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const outsideTenant = await this.prisma.order.count({
      where: {
        id: { in: orderIds },
        restaurantId: { not: run.restaurantId },
      },
    });
    return {
      key: 'tenant-scope',
      status: outsideTenant === 0 ? 'PASS' : 'FAIL',
      detail:
        outsideTenant === 0
          ? `${orderIds.length} pedidos pertenecen al tenant Lab`
          : `${outsideTenant} pedidos pertenecen a otro tenant`,
    };
  }

  private async evaluateOrderCausality(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { restaurantId: true },
    });
    const orders = await this.prisma.order.findMany({
      where: { restaurantId: run.restaurantId ?? '__missing__' },
      select: {
        id: true,
        status: true,
        statusHistory: {
          select: { toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const invalid = orders.filter((order) => {
      const preparing = order.statusHistory.find(
        (history) => history.toStatus === 'PREPARING',
      );
      const ready = order.statusHistory.find(
        (history) => history.toStatus === 'READY',
      );
      return (
        (order.status === 'READY' && !preparing) ||
        Boolean(ready && (!preparing || ready.createdAt < preparing.createdAt))
      );
    });
    return {
      key: 'order-preparation-causality',
      status: invalid.length === 0 ? 'PASS' : 'FAIL',
      detail:
        invalid.length === 0
          ? 'READY siempre ocurre después de PREPARING'
          : `Pedidos sin causalidad válida: ${invalid.map((order) => order.id).join(', ')}`,
    };
  }

  private async evaluateAuthorizedActions(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const events = await this.prisma.simulationTimelineEvent.findMany({
      where: {
        runId,
        action: {
          in: [
            ...ONLINE_MUTATION_ACTIONS,
            ...FLOOR_MUTATION_ACTIONS,
            ...DELIVERY_MUTATION_ACTIONS,
            ...PAYMENT_MUTATION_ACTIONS,
            ...FISCAL_MUTATION_ACTIONS,
            ...RESERVATION_MUTATION_ACTIONS,
            ...GROWTH_MUTATION_ACTIONS,
          ],
        },
      },
      select: { action: true, participantKey: true, correlationId: true },
    });
    const invalid = events.filter(
      (event) => !event.participantKey.trim() || !event.correlationId.trim(),
    );
    const onlineMutations = events.filter((event) =>
      (ONLINE_MUTATION_ACTIONS as readonly string[]).includes(event.action),
    ).length;
    // Pico online completo (~7 mutaciones). Flujos cortos (salón/ops/growth) ≥3.
    const minRequired = onlineMutations >= 7 ? 7 : 3;
    const ok = events.length >= minRequired && invalid.length === 0;
    return {
      key: 'authorized-actor-actions',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${events.length} mutaciones trazadas con participante y correlación`
        : `Mutaciones esperadas≥${minRequired}, observadas=${events.length}, inválidas=${invalid.length}`,
    };
  }

  private evaluateExternalEffects(runId: string): SimulationInvariantResult {
    const unsafe = this.effects
      .getAttempts()
      .filter(
        (attempt) =>
          attempt.runId === runId &&
          (attempt.result === 'ALLOWED' || attempt.result === 'EXECUTED'),
      );
    return {
      key: 'external-effects-blocked',
      status: unsafe.length === 0 ? 'PASS' : 'FAIL',
      detail:
        unsafe.length === 0
          ? 'No se permitió ni ejecutó ningún efecto externo'
          : `Efectos inseguros: ${unsafe.map((attempt) => attempt.boundary).join(', ')}`,
    };
  }

  private async evaluateOrderStateValidity(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { restaurantId: true },
    });
    const orders = await this.prisma.order.findMany({
      where: { restaurantId: run.restaurantId ?? '__missing__' },
      select: {
        id: true,
        status: true,
        statusHistory: {
          select: { fromStatus: true, toStatus: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const impossibleStatuses = new Set<string>(['UNKNOWN', 'IMPOSSIBLE']);
    const invalid: string[] = [];
    for (const order of orders) {
      if (impossibleStatuses.has(String(order.status))) {
        invalid.push(`${order.id}:estado=${order.status}`);
        continue;
      }
      for (const entry of order.statusHistory) {
        if (!entry.fromStatus) continue;
        const allowed = VALID_TRANSITIONS[entry.fromStatus] ?? [];
        if (!allowed.includes(entry.toStatus)) {
          invalid.push(`${order.id}:${entry.fromStatus}->${entry.toStatus}`);
        }
      }
    }

    return {
      key: 'order-state-validity',
      status: invalid.length === 0 ? 'PASS' : 'FAIL',
      detail:
        invalid.length === 0
          ? `${orders.length} pedidos sin estados imposibles`
          : `Transiciones/estados inválidos: ${invalid.join(', ')}`,
    };
  }

  private async evaluateExpectedIncidentsOnce(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
    });
    const state = asRuntimeState(run.runtimeState);
    const expected = state.incidentCodes ?? [];
    const observed = state.observedIncidents ?? [];
    const counts = new Map<LabIncidentCode, number>();
    for (const incident of observed) {
      counts.set(incident.code, (counts.get(incident.code) ?? 0) + 1);
    }

    const missing = expected.filter((code) => (counts.get(code) ?? 0) !== 1);
    const extras = [...counts.entries()].filter(
      ([code, count]) => !expected.includes(code) || count !== 1,
    );

    const ok = missing.length === 0 && extras.length === 0;
    return {
      key: 'expected-incidents-once',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `Incidentes esperados una vez: ${expected.join(', ') || '(ninguno)'}`
        : `Esperados=${expected.join('|') || '(ninguno)'}; observados=${
            observed.map((item) => item.code).join('|') || '(ninguno)'
          }`,
    };
  }

  private async evaluateStockNonNegative(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { restaurantId: true, runtimeState: true },
    });
    const state = asRuntimeState(run.runtimeState);
    if (!run.restaurantId) {
      return {
        key: 'stock-non-negative',
        status: 'FAIL',
        detail: 'Sin restaurante para evaluar stock',
      };
    }
    const items = await this.prisma.inventoryItem.findMany({
      where: { restaurantId: run.restaurantId },
      select: { id: true, name: true, currentStock: true },
    });
    const negative = items.filter((item) => item.currentStock < 0);
    const consumedOk = state.stockConsumed === true;
    if (negative.length > 0) {
      return {
        key: 'stock-non-negative',
        status: 'FAIL',
        detail: `Stock negativo: ${negative
          .map((item) => `${item.name}=${item.currentStock}`)
          .join(', ')}`,
      };
    }
    if (!consumedOk) {
      return {
        key: 'stock-non-negative',
        status: 'FAIL',
        detail: 'No se observó consumo de stock durante la ejecución',
      };
    }
    return {
      key: 'stock-non-negative',
      status: 'PASS',
      detail: `Stock no negativo (${items.length} insumos) y consumo observado`,
    };
  }

  private async evaluateTimelineContiguous(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const events = await this.prisma.simulationTimelineEvent.findMany({
      where: { runId },
      select: { sequence: true },
      orderBy: { sequence: 'asc' },
    });
    const sequences = events.map((event) => event.sequence);
    const expected = events.map((_, index) => index + 1);
    const ok =
      sequences.length > 0 &&
      sequences.every((value, index) => value === expected[index]);
    return {
      key: 'timeline-contiguous',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `Timeline contigua con ${sequences.length} eventos`
        : `Secuencias no contiguas: ${sequences.join(',')}`,
    };
  }

  private async evaluateIncidentReplayDeterminism(
    runId: string,
  ): Promise<SimulationInvariantResult> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
    });
    const state = asRuntimeState(run.runtimeState);
    const timeline = await this.prisma.simulationTimelineEvent.findMany({
      where: { runId },
      orderBy: { sequence: 'asc' },
    });
    const fingerprint = buildIncidentFingerprint({
      incidentCodes: state.incidentCodes ?? [],
      kitchenDelayMinutes: state.kitchenDelayMinutes ?? 0,
      observedIncidents: state.observedIncidents ?? [],
      timeline: normalizeTimeline(timeline, run.simulatedStartAt),
    });

    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        runtimeState: {
          ...state,
          incidentFingerprint: fingerprint,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const previous = await this.prisma.simulationRun.findFirst({
      where: {
        id: { not: runId },
        scenarioId: run.scenarioId,
        scenarioVersion: run.scenarioVersion,
        repetitionKey: run.repetitionKey,
        status: { in: ['COMPLETED', 'FAILED', 'STOPPED'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, runtimeState: true },
    });

    if (!previous) {
      return {
        key: 'incident-replay-determinism',
        status: 'PASS',
        detail: 'Baseline de fingerprint de incidentes establecido',
      };
    }

    const previousState = asRuntimeState(previous.runtimeState);
    const previousCodes = [...(previousState.incidentCodes ?? [])].join(',');
    const currentCodes = [...(state.incidentCodes ?? [])].join(',');
    if (previousCodes !== currentCodes) {
      return {
        key: 'incident-replay-determinism',
        status: 'PASS',
        detail:
          'No hay baseline comparable: distinta configuración de incidentes',
      };
    }

    const previousFingerprint = previousState.incidentFingerprint;
    if (!previousFingerprint) {
      return {
        key: 'incident-replay-determinism',
        status: 'PASS',
        detail: 'Baseline previo sin fingerprint; se estableció el actual',
      };
    }

    const ok = previousFingerprint === fingerprint;
    return {
      key: 'incident-replay-determinism',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? 'Replay con misma clave/configuración mantiene incidentes iguales'
        : `Fingerprint distinto al baseline ${previous.id}`,
    };
  }
}
