import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeTimeline } from '../core/timeline-normalizer';
import { LabEffectsPolicyService } from '../effects/lab-effects-policy.service';
import { buildIncidentFingerprint } from '../incidents/incident-fingerprint';
import { LabIncidentCode } from '../incidents/lab-incident.types';
import { PersistedSimulationRuntimeState } from '../runtime/simulation-runtime.types';

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
  | 'incident-replay-determinism';

export interface SimulationInvariantResult {
  key: SimulationInvariantKey;
  status: InvariantStatus;
  detail: string;
}

const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'CONFIRMED', 'CANCELLED'],
  PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class SimulationInvariantRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effects: LabEffectsPolicyService,
  ) {}

  async evaluate(runId: string): Promise<SimulationInvariantResult[]> {
    const evaluators = [
      () => this.evaluateTenantScope(runId),
      () => this.evaluateOrderCausality(runId),
      () => this.evaluateAuthorizedActions(runId),
      () => this.evaluateExternalEffects(runId),
      () => this.evaluateOrderStateValidity(runId),
      () => this.evaluateExpectedIncidentsOnce(runId),
      () => this.evaluateStockNonNegative(runId),
      () => this.evaluateTimelineContiguous(runId),
      () => this.evaluateIncidentReplayDeterminism(runId),
    ];

    const results: SimulationInvariantResult[] = [];
    for (const evaluate of evaluators) {
      try {
        results.push(await evaluate());
      } catch (error) {
        results.push({
          key: this.keyForIndex(results.length),
          status: 'ERROR',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
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
            'order.create',
            'order.preparing',
            'order.ready',
            'order.payment',
            'inventory.consume',
            'incident.kitchen-delay',
            'incident.stockout',
          ],
        },
      },
      select: { participantKey: true, correlationId: true },
    });
    const invalid = events.filter(
      (event) => !event.participantKey.trim() || !event.correlationId.trim(),
    );
    return {
      key: 'authorized-actor-actions',
      status: events.length >= 7 && invalid.length === 0 ? 'PASS' : 'FAIL',
      detail:
        events.length >= 7 && invalid.length === 0
          ? `${events.length} mutaciones trazadas con participante y correlación`
          : `Mutaciones esperadas≥7, observadas=${events.length}, inválidas=${invalid.length}`,
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

  private keyForIndex(index: number): SimulationInvariantKey {
    return [
      'tenant-scope',
      'order-preparation-causality',
      'authorized-actor-actions',
      'external-effects-blocked',
      'order-state-validity',
      'expected-incidents-once',
      'stock-non-negative',
      'timeline-contiguous',
      'incident-replay-determinism',
    ][index] as SimulationInvariantKey;
  }
}
