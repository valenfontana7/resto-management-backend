import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, SimulationRunStatus } from '@prisma/client';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_LAB_PROFILE,
  resolveLabHitlRole,
  resolveLabProfile,
  type LabHitlRole,
} from '../bootstrap/lab-profile.types';
import {
  SimulationBootstrapResult,
  SimulationBootstrapService,
} from '../bootstrap/simulation-bootstrap.service';
import { SimulationCleanupService } from '../cleanup/simulation-cleanup.service';
import { DeterministicEventQueue } from '../core/deterministic-event-queue';
import { XorShift32 } from '../core/prng';
import { buildIncidentFingerprint } from '../incidents/incident-fingerprint';
import {
  canonicalizeLabIncidents,
  LabIncidentCode,
  ObservedLabIncident,
} from '../incidents/lab-incident.types';
import { SimulationInvariantRegistry } from '../invariants/simulation-invariant.registry';
import { ClientParticipant } from '../participants/client.participant';
import { DeliveryParticipant } from '../participants/delivery.participant';
import { FiscalParticipant } from '../participants/fiscal.participant';
import { FloorParticipant } from '../participants/floor.participant';
import { GrowthParticipant } from '../participants/growth.participant';
import { InventoryParticipant } from '../participants/inventory.participant';
import { KitchenParticipant } from '../participants/kitchen.participant';
import { PaymentParticipant } from '../participants/payment.participant';
import { ReservationParticipant } from '../participants/reservation.participant';
import { getLabScenario } from '../scenarios/scenario-registry';
import {
  LabScenarioDefinition,
  LabScenarioEvent,
} from '../scenarios/scenario.types';
import { SimulationTimelineService } from '../timeline/simulation-timeline.service';
import { normalizeTimeline } from '../core/timeline-normalizer';
import {
  CreateSimulationRunInput,
  PersistedSimulationRuntimeState,
  RuntimeQueueEvent,
  SimulationRunDiagnostics,
  SimulationRunView,
} from './simulation-runtime.types';

interface ActiveSimulation {
  runId: string;
  scenario: LabScenarioDefinition;
  bootstrap: SimulationBootstrapResult;
  queue: DeterministicEventQueue<RuntimeQueueEvent>;
  random: XorShift32;
  state: PersistedSimulationRuntimeState;
  simulatedStartAt: Date;
  elapsedMs: number;
  controlOrdinal: number;
  timer?: NodeJS.Timeout;
  ticking: boolean;
  resolveCompletion: () => void;
  completion: Promise<void>;
}

@Injectable()
export class SimulationRuntimeService implements OnModuleDestroy {
  private readonly activeRuns = new Map<string, ActiveSimulation>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrapService: SimulationBootstrapService,
    private readonly cleanupService: SimulationCleanupService,
    private readonly timeline: SimulationTimelineService,
    private readonly client: ClientParticipant,
    private readonly kitchen: KitchenParticipant,
    private readonly inventory: InventoryParticipant,
    private readonly floor: FloorParticipant,
    private readonly payment: PaymentParticipant,
    private readonly fiscal: FiscalParticipant,
    private readonly delivery: DeliveryParticipant,
    private readonly reservations: ReservationParticipant,
    private readonly growth: GrowthParticipant,
    private readonly invariants: SimulationInvariantRegistry,
    private readonly auth: AuthService,
  ) {}

  async createRun(input: CreateSimulationRunInput): Promise<SimulationRunView> {
    const scenario = getLabScenario(input.scenarioId);
    const incidentCodes = canonicalizeLabIncidents(input.incidentCodes);
    const simulatedStartAt = input.simulatedStartAt
      ? new Date(input.simulatedStartAt)
      : this.roundToMinute(new Date());
    const random = new XorShift32(input.repetitionKey);
    const initialSeed = random.snapshot();
    const prepared = this.prepareRuntimeState(scenario, random, incidentCodes);
    const bootstrap = await this.bootstrapService.bootstrap({
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      repetitionKey: input.repetitionKey,
      seedState: String(initialSeed.state),
      simulatedStartAt,
      labProfile: resolveLabProfile(
        input.labProfile ?? scenario.preferredLabProfile ?? DEFAULT_LAB_PROFILE,
      ),
    });
    prepared.inventoryItemId = bootstrap.inventoryItemId;

    await this.prisma.simulationRun.update({
      where: { id: bootstrap.run.id },
      data: {
        seedState: String(random.snapshot().state),
        runtimeState: prepared as unknown as Prisma.InputJsonValue,
      },
    });
    await this.timeline.append(bootstrap.run.id, {
      logicalEventId: 'simulation.created',
      logicalEntityKey: 'simulation',
      simulatedAt: simulatedStartAt,
      participantKey: 'system',
      domain: 'lab',
      action: 'simulation.create',
      resultCode: 'CREATED',
      entityType: 'SimulationRun',
      entityId: bootstrap.run.id,
      correlationId: `${bootstrap.run.id}:create`,
      summary: `Ejecución creada con repetición ${input.repetitionKey} · incidentes ${
        incidentCodes.join(', ') || 'ninguno'
      }`,
    });

    this.activeRuns.set(
      bootstrap.run.id,
      this.createActiveSimulation(
        scenario,
        bootstrap,
        random,
        prepared,
        simulatedStartAt,
      ),
    );
    return this.getRun(bootstrap.run.id);
  }

  async start(runId: string): Promise<SimulationRunView> {
    const active = this.requireActive(runId);
    await this.transitionToRunning(active);
    this.startTimer(active);
    return this.getRun(runId);
  }

  async runHeadless(
    input: CreateSimulationRunInput,
  ): Promise<SimulationRunView> {
    const created = await this.createRun(input);
    const active = this.requireActive(created.id);
    await this.transitionToRunning(active, 'HEADLESS');

    try {
      while (active.queue.size > 0) {
        const next = active.queue.peek();
        if (!next) break;
        active.elapsedMs = next.atMs;
        await this.processReadyEvents(active);
        const run = await this.prisma.simulationRun.findUniqueOrThrow({
          where: { id: active.runId },
          select: { status: true },
        });
        if (
          run.status === SimulationRunStatus.COMPLETED ||
          run.status === SimulationRunStatus.FAILED
        ) {
          break;
        }
      }
    } catch (error) {
      await this.failRun(active, error);
      throw error;
    }
    return this.getRun(created.id);
  }

  async pause(runId: string): Promise<SimulationRunView> {
    const active = this.requireActive(runId);
    this.clearTimer(active);
    await this.waitForIdle(active);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: SimulationRunStatus.PAUSED },
    });
    await this.appendControlEvent(active, 'pause', 'PAUSED');
    return this.getRun(runId);
  }

  async resume(runId: string): Promise<SimulationRunView> {
    const active = this.requireActive(runId);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: SimulationRunStatus.RUNNING },
    });
    await this.appendControlEvent(active, 'resume', 'RUNNING');
    this.startTimer(active);
    return this.getRun(runId);
  }

  async stop(runId: string): Promise<SimulationRunView> {
    const active = this.requireActive(runId);
    this.clearTimer(active);
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: {
        status: SimulationRunStatus.STOPPED,
        completedAt: new Date(),
      },
    });
    await this.appendControlEvent(active, 'stop', 'STOPPED');
    active.resolveCompletion();
    return this.getRun(runId);
  }

  async cleanup(runId: string, removeRun = false): Promise<void> {
    const active = this.activeRuns.get(runId);
    if (active) {
      this.clearTimer(active);
      active.resolveCompletion();
      this.activeRuns.delete(runId);
    }
    await this.cleanupService.cleanup(runId, { removeRun });
  }

  async getRun(runId: string): Promise<SimulationRunView> {
    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
    });
    const persisted = run.runtimeState as unknown as
      | PersistedSimulationRuntimeState
      | undefined;
    const active = this.activeRuns.get(runId);
    const diagnostics = await this.buildDiagnostics(runId, active, persisted);
    return {
      id: run.id,
      scenarioId: run.scenarioId,
      scenarioVersion: run.scenarioVersion,
      repetitionKey: run.repetitionKey,
      status: run.status,
      restaurantId: run.restaurantId,
      simulatedStartAt: run.simulatedStartAt,
      simulatedNow: active ? this.simulatedDate(active) : run.simulatedNow,
      visualSpeed: run.visualSpeed,
      pendingEvents: active?.queue.size ?? persisted?.queue?.length ?? 0,
      invariantResults: run.invariantResults,
      diagnostics,
    };
  }

  async openAsManager(runId: string) {
    return this.openAsRole(runId, 'manager');
  }

  async openAsRole(runId: string, roleRaw: string) {
    const role = resolveLabHitlRole(roleRaw);
    if (!role) {
      throw new BadRequestException(
        `Rol HITL Lab inválido: ${roleRaw}. Usá manager, kitchen, waiter, owner o chef.`,
      );
    }

    const run = await this.prisma.simulationRun.findUniqueOrThrow({
      where: { id: runId },
      select: {
        restaurantId: true,
        simulatedNow: true,
        simulatedStartAt: true,
      },
    });
    if (!run.restaurantId) {
      throw new Error('La ejecución no tiene restaurante activo');
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: run.restaurantId },
      select: { slug: true },
    });

    const active = this.activeRuns.get(runId);
    const simulatedNow = active ? this.simulatedDate(active) : run.simulatedNow;
    const businessDate = simulatedNow.toISOString().slice(0, 10);
    const path = this.hitlPathForRole(role, restaurant.slug, businessDate);

    if (active) {
      const token = this.tokenForRole(active.bootstrap, role);
      if (!token) {
        throw new BadRequestException(
          `La ejecución no tiene usuario ${role} (¿perfil minimal sin mozo?)`,
        );
      }
      return {
        token,
        restaurantId: run.restaurantId,
        role,
        path,
        simulatedNow: simulatedNow.toISOString(),
        businessDate,
      };
    }

    const roleName = this.prismaRoleName(role);
    const user = await this.prisma.user.findFirstOrThrow({
      where: {
        restaurantId: run.restaurantId,
        role: { name: roleName },
      },
      select: { id: true },
    });
    const auth = await this.auth.createAuthResponseForUserId(user.id);
    return {
      token: auth.token,
      restaurantId: run.restaurantId,
      role,
      path,
      simulatedNow: simulatedNow.toISOString(),
      businessDate,
    };
  }

  private prismaRoleName(role: LabHitlRole): string {
    switch (role) {
      case 'manager':
        return 'MANAGER';
      case 'kitchen':
      case 'chef':
        // Catálogo Bentoo: CHEF es alias legacy de KITCHEN.
        return 'KITCHEN';
      case 'waiter':
        return 'WAITER';
      case 'owner':
        return 'OWNER';
      default: {
        const _exhaustive: never = role;
        return _exhaustive;
      }
    }
  }

  private tokenForRole(
    bootstrap: SimulationBootstrapResult,
    role: LabHitlRole,
  ): string | null {
    switch (role) {
      case 'manager':
        return bootstrap.managerToken;
      case 'kitchen':
      case 'chef':
        return bootstrap.kitchenToken;
      case 'waiter':
        return bootstrap.waiterToken;
      case 'owner':
        return bootstrap.ownerToken;
      default: {
        const _exhaustive: never = role;
        return _exhaustive;
      }
    }
  }

  private hitlPathForRole(
    role: LabHitlRole,
    slug: string,
    businessDate: string,
  ): string {
    switch (role) {
      case 'manager':
      case 'owner':
        return `/admin/operacion?date=${businessDate}`;
      case 'kitchen':
      case 'chef':
        return `/kitchen/${slug}?date=${businessDate}`;
      case 'waiter':
        return `/admin/salon?date=${businessDate}`;
      default: {
        const _exhaustive: never = role;
        return _exhaustive;
      }
    }
  }

  waitForCompletion(runId: string): Promise<void> {
    return this.requireActive(runId).completion;
  }

  onModuleDestroy(): void {
    for (const active of this.activeRuns.values()) {
      this.clearTimer(active);
    }
  }

  private prepareRuntimeState(
    scenario: LabScenarioDefinition,
    random: XorShift32,
    incidentCodes: LabIncidentCode[],
  ): PersistedSimulationRuntimeState {
    let kitchenDelayMinutes = 0;
    if (incidentCodes.includes('KITCHEN_DELAY')) {
      kitchenDelayMinutes = random.nextInt(3, 6);
    }

    const orderChoices: PersistedSimulationRuntimeState['orderChoices'] = {};
    const queue: RuntimeQueueEvent[] = [];

    for (const event of scenario.events) {
      if (
        event.type === 'INCIDENT_KITCHEN_DELAY' &&
        !incidentCodes.includes('KITCHEN_DELAY')
      ) {
        continue;
      }
      if (
        event.type === 'INCIDENT_STOCKOUT' &&
        !incidentCodes.includes('STOCKOUT')
      ) {
        continue;
      }

      let atMs = event.atMinute * 60_000;
      if (
        incidentCodes.includes('KITCHEN_DELAY') &&
        (event.type === 'KITCHEN_START_ORDER' ||
          event.type === 'KITCHEN_READY_ORDER')
      ) {
        atMs += kitchenDelayMinutes * 60_000;
      }

      if (event.type === 'CLIENT_CREATE_ONLINE_ORDER') {
        atMs += random.nextInt(0, 89) * 1000;
        const menuItem = random.pick(scenario.menu);
        orderChoices[event.orderKey] = {
          orderKey: event.orderKey,
          dishName: menuItem.name,
          quantity: random.nextInt(1, 2),
          ...(event.couponCode ? { couponCode: event.couponCode } : {}),
          ...(event.paymentMethod
            ? { paymentMethod: event.paymentMethod }
            : {}),
        };
      }

      const runtimeEvent: RuntimeQueueEvent = { ...event, atMs };
      if (event.type === 'INCIDENT_KITCHEN_DELAY') {
        runtimeEvent.delayMinutes = kitchenDelayMinutes;
      }
      queue.push(runtimeEvent);
    }

    return {
      queue,
      random: random.snapshot(),
      orderChoices,
      orderIds: {},
      sessionIds: {},
      reservationIds: {},
      processedEventIds: [],
      incidentCodes,
      kitchenDelayMinutes,
      observedIncidents: [],
      stockConsumed: false,
    };
  }

  private createActiveSimulation(
    scenario: LabScenarioDefinition,
    bootstrap: SimulationBootstrapResult,
    random: XorShift32,
    state: PersistedSimulationRuntimeState,
    simulatedStartAt: Date,
  ): ActiveSimulation {
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    return {
      runId: bootstrap.run.id,
      scenario,
      bootstrap,
      queue: new DeterministicEventQueue(state.queue),
      random,
      state,
      simulatedStartAt,
      elapsedMs: 0,
      controlOrdinal: 0,
      ticking: false,
      resolveCompletion,
      completion,
    };
  }

  private async transitionToRunning(
    active: ActiveSimulation,
    origin: 'SIMULATED' | 'HEADLESS' = 'SIMULATED',
  ): Promise<void> {
    await this.prisma.simulationRun.update({
      where: { id: active.runId },
      data: {
        status: SimulationRunStatus.RUNNING,
        startedAt: new Date(),
      },
    });
    await this.timeline.append(active.runId, {
      logicalEventId: 'simulation.started',
      logicalEntityKey: 'simulation',
      simulatedAt: this.simulatedDate(active),
      participantKey: 'system',
      domain: 'lab',
      action: 'simulation.start',
      resultCode: 'RUNNING',
      entityType: 'SimulationRun',
      entityId: active.runId,
      correlationId: `${active.runId}:start`,
      summary: `Ejecución iniciada (${origin.toLowerCase()})`,
    });
  }

  private startTimer(active: ActiveSimulation): void {
    this.clearTimer(active);
    active.timer = setInterval(() => {
      if (active.ticking) return;
      active.ticking = true;
      active.elapsedMs = Math.min(
        active.elapsedMs + 5_000,
        active.scenario.durationMinutes * 60_000,
      );
      void this.processReadyEvents(active)
        .catch((error) => this.failRun(active, error))
        .finally(() => {
          active.ticking = false;
        });
    }, 250);
  }

  private async processReadyEvents(active: ActiveSimulation): Promise<void> {
    const ready = active.queue.drainReady(active.elapsedMs);
    for (const event of ready) {
      await this.processEvent(active, event);
      active.state.processedEventIds.push(event.id);
      active.state.queue = active.queue.snapshot();
      active.state.random = active.random.snapshot();
      await this.persistCheckpoint(active);
    }
  }

  private async processEvent(
    active: ActiveSimulation,
    event: RuntimeQueueEvent,
  ): Promise<void> {
    const simulatedAt = this.simulatedDate(active, event.atMs);
    const correlationId = `${active.runId}:${event.id}`;
    switch (event.type) {
      case 'CLIENT_CREATE_ONLINE_ORDER': {
        const choice = active.state.orderChoices[event.orderKey];
        if (!choice) throw new Error(`Falta elección para ${event.orderKey}`);
        const orderKeyParts = event.orderKey.split('.');
        const sequence = Number(orderKeyParts[orderKeyParts.length - 1]) || 1;
        const response = await this.client.createOrder({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          participantKey: 'client',
          simulatedNow: simulatedAt,
          correlationId,
          sequence,
          dishName: choice.dishName,
          quantity: choice.quantity,
          couponCode: choice.couponCode,
          paymentMethod: choice.paymentMethod,
        });
        active.state.orderIds[event.orderKey] = response.order.id;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'client',
          domain: 'orders',
          action: 'order.create',
          resultCode: response.order.status,
          entityType: 'Order',
          entityId: response.order.id,
          correlationId,
          summary: choice.couponCode
            ? `${choice.quantity} × ${choice.dishName} · cupón ${choice.couponCode}`
            : `${choice.quantity} × ${choice.dishName}`,
        });
        return;
      }
      case 'PAYMENT_SYNTHETIC_APPROVE': {
        const checkoutSessionId = active.state.orderIds[event.orderKey];
        if (!checkoutSessionId) {
          throw new Error(
            `No hay checkoutSessionId para aprobar ${event.orderKey}`,
          );
        }
        const approved = await this.payment.approveSynthetic(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            checkoutSessionId,
          },
        );
        if (!approved) {
          throw new Error(
            `No se pudo aprobar sintéticamente ${checkoutSessionId}`,
          );
        }
        active.state.orderIds[event.orderKey] = checkoutSessionId;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'system',
          domain: 'payments',
          action: 'payment.approve',
          resultCode: 'PAID',
          entityType: 'Order',
          entityId: checkoutSessionId,
          correlationId,
          summary: 'Pago sintético aprobado',
        });
        return;
      }
      case 'FISCAL_ISSUE_ORDER': {
        const orderId = active.state.orderIds[event.orderKey];
        if (!orderId) {
          throw new Error(`No hay orderId para fiscalizar ${event.orderKey}`);
        }
        const managerToken = active.bootstrap.managerToken;
        if (!managerToken) {
          throw new Error('FISCAL_ISSUE_ORDER requiere manager Lab');
        }
        const issued = await this.fiscal.issueForOrder(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: managerToken,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            orderId,
            type: event.documentType ?? 'FACTURA_B',
            customerName: event.customerName,
            customerDocType: event.customerDocType,
            customerDocNumber: event.customerDocNumber,
          },
        );
        const { documentId, cae, status } =
          this.extractFiscalIssueMetadata(issued);
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'manager',
          domain: 'fiscal',
          action: 'fiscal.issue',
          resultCode: status ?? 'ISSUED',
          entityType: 'FiscalDocument',
          entityId: documentId,
          correlationId,
          summary: cae
            ? `Comprobante fiscal emitido · CAE ${cae}`
            : 'Comprobante fiscal emitido',
        });
        return;
      }
      case 'MANAGER_MARK_ORDER_PAID': {
        const orderId = active.state.orderIds[event.orderKey];
        if (!orderId) {
          throw new Error(`No hay orderId para cobrar ${event.orderKey}`);
        }
        const paid = await this.inventory.markOrderPaid({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: active.bootstrap.managerToken,
          simulatedNow: simulatedAt,
          correlationId,
          orderId,
        });
        active.state.stockConsumed = true;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'manager',
          domain: 'orders',
          action: 'order.payment',
          resultCode: paid.paymentStatus,
          entityType: 'Order',
          entityId: paid.orderId,
          correlationId,
          summary: 'Manager registró cobro en efectivo',
        });
        await this.timeline.append(active.runId, {
          logicalEventId: `${event.id}.consume`,
          logicalEntityKey: 'inventory.masa',
          simulatedAt,
          participantKey: 'manager',
          domain: 'inventory',
          action: 'inventory.consume',
          resultCode: 'DEDUCTED',
          entityType: 'InventoryItem',
          entityId: active.state.inventoryItemId,
          correlationId: `${correlationId}:consume`,
          summary: 'Consumo de stock observado tras el cobro',
        });
        return;
      }
      case 'INCIDENT_KITCHEN_DELAY': {
        const delayMinutes =
          event.delayMinutes ?? active.state.kitchenDelayMinutes;
        const observed: ObservedLabIncident = {
          code: 'KITCHEN_DELAY',
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          correlationId,
          detail: `Cocina demorada ${delayMinutes} minutos`,
        };
        this.recordIncident(active, observed);
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'system',
          domain: 'incident',
          action: 'incident.kitchen-delay',
          resultCode: 'INJECTED',
          entityType: 'Order',
          entityId: active.state.orderIds[event.orderKey],
          correlationId,
          summary: observed.detail,
        });
        return;
      }
      case 'INCIDENT_STOCKOUT': {
        const inventoryItemId =
          active.state.inventoryItemId ?? active.bootstrap.inventoryItemId;
        const stockout = await this.inventory.forceStockout({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: active.bootstrap.managerToken,
          simulatedNow: simulatedAt,
          correlationId,
          inventoryItemId,
        });
        const observed: ObservedLabIncident = {
          code: 'STOCKOUT',
          logicalEventId: event.id,
          logicalEntityKey: `inventory.${event.inventoryItemKey}`,
          correlationId,
          detail: `Stockout de ${stockout.item.name}; platos deshabilitados=${stockout.disabledDishIds.length}`,
        };
        this.recordIncident(active, observed);
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: observed.logicalEntityKey,
          simulatedAt,
          participantKey: 'manager',
          domain: 'incident',
          action: 'incident.stockout',
          resultCode: 'INJECTED',
          entityType: 'InventoryItem',
          entityId: stockout.item.id,
          correlationId,
          summary: observed.detail,
        });
        return;
      }
      case 'KITCHEN_START_ORDER': {
        const expectedOrderId = active.state.orderIds[event.orderKey];
        const response = await this.kitchen.startOldestConfirmed({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: active.bootstrap.kitchenToken,
          simulatedNow: simulatedAt,
          correlationId,
          expectedOrderId,
        });
        await this.appendKitchenEvent(
          active,
          event,
          response.order.id,
          simulatedAt,
          correlationId,
          'order.preparing',
          'PREPARING',
        );
        return;
      }
      case 'KITCHEN_READY_ORDER': {
        const expectedOrderId = active.state.orderIds[event.orderKey];
        const response = await this.kitchen.markReady({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: active.bootstrap.kitchenToken,
          simulatedNow: simulatedAt,
          correlationId,
          expectedOrderId,
        });
        await this.appendKitchenEvent(
          active,
          event,
          response.order.id,
          simulatedAt,
          correlationId,
          'order.ready',
          'READY',
        );
        return;
      }
      case 'MANAGER_MARK_ORDER_DELIVERED': {
        const orderId = active.state.orderIds[event.orderKey];
        if (!orderId) {
          throw new Error(`No hay orderId para entregar ${event.orderKey}`);
        }
        const response = await this.kitchen.markDelivered({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: active.bootstrap.managerToken,
          simulatedNow: simulatedAt,
          correlationId,
          expectedOrderId: orderId,
        });
        await this.appendKitchenEvent(
          active,
          event,
          response.order.id,
          simulatedAt,
          correlationId,
          'order.delivered',
          'DELIVERED',
        );
        return;
      }
      case 'FLOOR_OPEN_TABLE': {
        const waiterToken = active.bootstrap.waiterToken;
        if (!waiterToken) {
          throw new Error('FLOOR_OPEN_TABLE requiere perfil ops-core con mozo');
        }
        const opened = await this.floor.openTable(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            tableNumber: event.tableNumber,
            guestCount: event.guestCount,
          },
        );
        active.state.sessionIds ??= {};
        active.state.sessionIds[event.sessionKey] = opened.session.id;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.sessionKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'floor',
          action: 'floor.session.open',
          resultCode: opened.session.status,
          entityType: 'TableSession',
          entityId: opened.session.id,
          correlationId,
          summary: `Mesa ${event.tableNumber} abierta (${opened.session.sessionNumber})`,
        });
        return;
      }
      case 'FLOOR_ADD_ITEMS': {
        const sessionId = active.state.sessionIds[event.sessionKey];
        if (!sessionId) {
          throw new Error(`No hay sessionId para ${event.sessionKey}`);
        }
        const waiterToken = active.bootstrap.waiterToken;
        if (!waiterToken) {
          throw new Error('FLOOR_ADD_ITEMS requiere mozo Lab');
        }
        const updated = await this.floor.addItems(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            sessionId,
            dishName: event.dishName,
            quantity: event.quantity,
          },
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.sessionKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'floor',
          action: 'floor.session.add-items',
          resultCode: 'ADDED',
          entityType: 'TableSession',
          entityId: updated.session.id,
          correlationId,
          summary: `${event.quantity} × ${event.dishName}`,
        });
        return;
      }
      case 'FLOOR_SEND_KITCHEN': {
        const sessionId = active.state.sessionIds[event.sessionKey];
        if (!sessionId) {
          throw new Error(`No hay sessionId para ${event.sessionKey}`);
        }
        const waiterToken = active.bootstrap.waiterToken;
        if (!waiterToken) {
          throw new Error('FLOOR_SEND_KITCHEN requiere mozo Lab');
        }
        const sent = await this.floor.sendToKitchen(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
          },
          sessionId,
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.sessionKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'floor',
          action: 'floor.session.send-kitchen',
          resultCode: 'SENT',
          entityType: 'TableSession',
          entityId: sent.session.id,
          correlationId,
          summary: 'Comanda enviada a cocina',
        });
        return;
      }
      case 'FLOOR_MERGE_TABLES': {
        const sessionId = active.state.sessionIds[event.sessionKey];
        if (!sessionId) {
          throw new Error(`No hay sessionId para ${event.sessionKey}`);
        }
        const waiterToken = active.bootstrap.waiterToken;
        if (!waiterToken) {
          throw new Error('FLOOR_MERGE_TABLES requiere mozo Lab');
        }
        const merged = await this.floor.mergeTables(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            sessionId,
            tableNumbers: [...event.tableNumbers],
          },
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.sessionKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'floor',
          action: 'floor.session.merge-tables',
          resultCode: 'MERGED',
          entityType: 'TableSession',
          entityId: merged.session.id,
          correlationId,
          summary: `Mesas unidas: ${event.tableNumbers.join(', ')}`,
        });
        return;
      }
      case 'FLOOR_CLOSE_SESSION': {
        const sessionId = active.state.sessionIds[event.sessionKey];
        if (!sessionId) {
          throw new Error(`No hay sessionId para ${event.sessionKey}`);
        }
        const closerRole = event.participantKey;
        const closerToken =
          closerRole === 'waiter'
            ? active.bootstrap.waiterToken
            : active.bootstrap.managerToken;
        if (!closerToken) {
          throw new Error(
            `FLOOR_CLOSE_SESSION sin token para rol ${closerRole}`,
          );
        }
        const floorCtx = {
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          jwt: closerToken,
          simulatedNow: simulatedAt,
          correlationId,
        };
        const itemSelector = event.itemSelector ?? 'all-unpaid';
        const sessionSnapshot = await this.floor.getSession(
          floorCtx,
          sessionId,
        );
        const itemIds = this.floor.resolveUnpaidItemIds(
          sessionSnapshot,
          itemSelector,
        );
        const closed = await this.floor.closeSession(floorCtx, {
          sessionId,
          paymentMethod: event.paymentMethod ?? 'cash',
          participantKey: closerRole,
          itemIds,
          fiscalDocumentType: event.fiscalDocumentType ?? 'INTERNAL_TICKET',
          customerName: event.customerName,
          customerDocType: event.customerDocType,
          customerDocNumber: event.customerDocNumber,
        });
        const paymentOrderId = closed.order?.id;
        if (paymentOrderId) {
          active.state.orderIds[`floor.close.${event.id}`] = paymentOrderId;
        }
        const closeKind = closed.partial ? 'parcial' : 'total';
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.sessionKey,
          simulatedAt,
          participantKey: closerRole,
          domain: 'floor',
          action: 'floor.session.close',
          resultCode: closed.session.status,
          entityType: 'TableSession',
          entityId: closed.session.id,
          correlationId,
          summary: `Cobro ${closeKind} (${event.paymentMethod ?? 'cash'} · ${itemIds.length} ítem/s)`,
        });
        const fiscal = closed.fiscalDocument;
        if (fiscal?.id && event.fiscalDocumentType === 'FACTURA_B') {
          await this.timeline.append(active.runId, {
            logicalEventId: `${event.id}.fiscal`,
            logicalEntityKey: event.sessionKey,
            simulatedAt,
            participantKey: closerRole,
            domain: 'fiscal',
            action: 'fiscal.issue',
            resultCode: fiscal.status ?? 'ISSUED',
            entityType: 'FiscalDocument',
            entityId: fiscal.id,
            correlationId: `${correlationId}:fiscal`,
            summary: fiscal.cae
              ? `Factura salón · CAE ${fiscal.cae}`
              : 'Factura salón emitida',
          });
        }
        return;
      }
      case 'DELIVERY_CREATE_ORDER': {
        const waiterToken = active.bootstrap.waiterToken;
        const deliveryZoneId = active.bootstrap.deliveryZoneId;
        if (!waiterToken || !deliveryZoneId) {
          throw new Error(
            'DELIVERY_CREATE_ORDER requiere ops-core con mozo y zona',
          );
        }
        const created = await this.delivery.createOrder(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
            deliveryZoneId,
          },
          {
            deliveryAddress: event.deliveryAddress,
            customerName: event.customerName,
            customerPhone: event.customerPhone,
          },
        );
        active.state.orderIds[event.orderKey] = created.order.id;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'delivery',
          action: 'delivery.order.create',
          resultCode: created.order.status,
          entityType: 'Order',
          entityId: created.order.id,
          correlationId,
          summary: `Domicilio ${created.order.orderNumber} · ${event.deliveryAddress}`,
        });
        return;
      }
      case 'DELIVERY_ADD_ITEMS': {
        const orderId = active.state.orderIds[event.orderKey];
        if (!orderId) {
          throw new Error(`No hay orderId para ${event.orderKey}`);
        }
        const waiterToken = active.bootstrap.waiterToken;
        const deliveryZoneId = active.bootstrap.deliveryZoneId;
        if (!waiterToken || !deliveryZoneId) {
          throw new Error('DELIVERY_ADD_ITEMS requiere mozo Lab y zona');
        }
        const updated = await this.delivery.addItems(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            jwt: waiterToken,
            simulatedNow: simulatedAt,
            correlationId,
            deliveryZoneId,
          },
          {
            orderId,
            dishName: event.dishName,
            quantity: event.quantity,
          },
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.orderKey,
          simulatedAt,
          participantKey: 'waiter',
          domain: 'delivery',
          action: 'delivery.order.add-items',
          resultCode: updated.order.status,
          entityType: 'Order',
          entityId: updated.order.id,
          correlationId,
          summary: `${event.quantity} × ${event.dishName} → cocina`,
        });
        return;
      }
      case 'RESERVATION_CREATE': {
        const created = await this.reservations.create(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            customerName: event.customerName,
            customerPhone: event.customerPhone,
            customerEmail: event.customerEmail,
            partySize: event.partySize,
            time: event.time,
          },
        );
        active.state.reservationIds ??= {};
        active.state.reservationIds[event.reservationKey] =
          created.reservation.id;
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: event.reservationKey,
          simulatedAt,
          participantKey: 'system',
          domain: 'reservations',
          action: 'reservation.create',
          resultCode: created.reservation.status,
          entityType: 'Reservation',
          entityId: created.reservation.id,
          correlationId,
          summary: `${event.customerName} · ${event.partySize} pax · ${event.time}`,
        });
        return;
      }
      case 'COUPON_VALIDATE': {
        const validated = await this.growth.validateCoupon(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            couponCode: event.couponCode,
            orderAmount: event.orderAmount,
          },
        );
        if (!validated.valid) {
          throw new Error(
            `Cupón inválido ${event.couponCode}: ${validated.message ?? 'sin detalle'}`,
          );
        }
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: `coupon.${event.couponCode}`,
          simulatedAt,
          participantKey: 'client',
          domain: 'coupons',
          action: 'coupon.validate',
          resultCode: 'VALID',
          entityType: 'Coupon',
          correlationId,
          summary: `${event.couponCode} · dto ${validated.discountAmount}`,
        });
        return;
      }
      case 'LOYALTY_ENROLL': {
        const account = await this.growth.enrollLoyalty(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            email: event.customerEmail,
            name: event.customerName,
            phone: event.customerPhone,
          },
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: `loyalty.${event.customerEmail}`,
          simulatedAt,
          participantKey: 'client',
          domain: 'loyalty',
          action: 'loyalty.enroll',
          resultCode: 'ENROLLED',
          entityType: 'LoyaltyAccount',
          entityId: account.id,
          correlationId,
          summary: `${event.customerName} · ${event.customerEmail}`,
        });
        return;
      }
      case 'REVIEW_CREATE': {
        const review = await this.growth.createReview(
          {
            runId: active.runId,
            restaurantId: active.bootstrap.restaurant.id,
            simulatedNow: simulatedAt,
            correlationId,
          },
          {
            customerName: event.customerName,
            rating: event.rating,
            comment: event.comment,
            customerEmail: event.customerEmail,
          },
        );
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: `review.${event.customerName}`,
          simulatedAt,
          participantKey: 'client',
          domain: 'reviews',
          action: 'review.create',
          resultCode: 'CREATED',
          entityType: 'Review',
          entityId: review.id,
          correlationId,
          summary: `${event.customerName} · ${event.rating}★`,
        });
        return;
      }
      case 'BUILDER_PUBLIC_GET': {
        const published = await this.growth.getPublishedBuilder({
          runId: active.runId,
          restaurantId: active.bootstrap.restaurant.id,
          simulatedNow: simulatedAt,
          correlationId,
        });
        if (
          !published ||
          (published as { success?: boolean }).success === false
        ) {
          throw new Error('Builder publicado no disponible en Lab');
        }
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: 'builder.public',
          simulatedAt,
          participantKey: 'client',
          domain: 'builder',
          action: 'builder.public.get',
          resultCode: 'OK',
          entityType: 'BuilderConfig',
          correlationId,
          summary: 'Config builder pública leída',
        });
        return;
      }
      case 'SIMULATION_COMPLETE':
        await this.timeline.append(active.runId, {
          logicalEventId: event.id,
          logicalEntityKey: 'simulation',
          simulatedAt,
          participantKey: 'system',
          domain: 'lab',
          action: 'simulation.complete',
          resultCode: 'EVALUATING',
          entityType: 'SimulationRun',
          entityId: active.runId,
          correlationId,
          summary: `Final de los ${active.scenario.durationMinutes} minutos simulados`,
        });
        await this.completeRun(active, simulatedAt);
        return;
      default:
        this.assertNever(event);
    }
  }

  private recordIncident(
    active: ActiveSimulation,
    incident: ObservedLabIncident,
  ): void {
    active.state.observedIncidents = [
      ...active.state.observedIncidents,
      incident,
    ];
  }

  private async appendKitchenEvent(
    active: ActiveSimulation,
    event: Extract<
      RuntimeQueueEvent,
      {
        type:
          | 'KITCHEN_START_ORDER'
          | 'KITCHEN_READY_ORDER'
          | 'MANAGER_MARK_ORDER_DELIVERED';
      }
    >,
    orderId: string,
    simulatedAt: Date,
    correlationId: string,
    action: string,
    resultCode: string,
  ): Promise<void> {
    const participantKey =
      event.type === 'MANAGER_MARK_ORDER_DELIVERED' ? 'manager' : 'kitchen';
    await this.timeline.append(active.runId, {
      logicalEventId: event.id,
      logicalEntityKey: event.orderKey,
      simulatedAt,
      participantKey,
      domain: 'orders',
      action,
      resultCode,
      entityType: 'Order',
      entityId: orderId,
      correlationId,
      summary:
        participantKey === 'manager'
          ? `Manager marcó el pedido como ${resultCode}`
          : `Cocina cambió el pedido a ${resultCode}`,
    });
  }

  private extractFiscalIssueMetadata(issued: unknown): {
    documentId?: string;
    cae?: string;
    status?: string;
  } {
    if (!issued || typeof issued !== 'object') {
      return {};
    }
    const topLevel = issued as {
      id?: unknown;
      cae?: unknown;
      status?: unknown;
      fiscalDocument?: {
        id?: unknown;
        cae?: unknown;
        status?: unknown;
      };
    };
    const nested = topLevel.fiscalDocument;
    return {
      documentId:
        typeof nested?.id === 'string'
          ? nested.id
          : typeof topLevel.id === 'string'
            ? topLevel.id
            : undefined,
      cae:
        typeof nested?.cae === 'string'
          ? nested.cae
          : typeof topLevel.cae === 'string'
            ? topLevel.cae
            : undefined,
      status:
        typeof nested?.status === 'string'
          ? nested.status
          : typeof topLevel.status === 'string'
            ? topLevel.status
            : undefined,
    };
  }

  private async completeRun(
    active: ActiveSimulation,
    simulatedAt: Date,
  ): Promise<void> {
    this.clearTimer(active);
    await this.persistCheckpoint(active);
    const results = await this.invariants.evaluate(
      active.runId,
      active.scenario.invariants,
    );
    const passed = results.every((result) => result.status === 'PASS');
    const timeline = await this.timeline.list(active.runId);
    const fingerprint = buildIncidentFingerprint({
      incidentCodes: active.state.incidentCodes,
      kitchenDelayMinutes: active.state.kitchenDelayMinutes,
      observedIncidents: active.state.observedIncidents,
      timeline: normalizeTimeline(timeline, active.simulatedStartAt),
    });
    active.state.incidentFingerprint = fingerprint;
    await this.prisma.simulationRun.update({
      where: { id: active.runId },
      data: {
        status: passed
          ? SimulationRunStatus.COMPLETED
          : SimulationRunStatus.FAILED,
        simulatedNow: simulatedAt,
        invariantResults: results as unknown as Prisma.InputJsonValue,
        runtimeState: active.state as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    active.resolveCompletion();
  }

  private async failRun(
    active: ActiveSimulation,
    error: unknown,
  ): Promise<void> {
    this.clearTimer(active);
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    await this.prisma.simulationRun.update({
      where: { id: active.runId },
      data: {
        status: SimulationRunStatus.FAILED,
        completedAt: new Date(),
        invariantResults: [
          {
            key: 'runtime',
            status: 'ERROR',
            detail: normalized.message,
          },
        ],
      },
    });
    active.resolveCompletion();
  }

  private persistCheckpoint(active: ActiveSimulation): Promise<unknown> {
    return this.prisma.simulationRun.update({
      where: { id: active.runId },
      data: {
        simulatedNow: this.simulatedDate(active),
        seedState: String(active.random.snapshot().state),
        runtimeState: active.state as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async appendControlEvent(
    active: ActiveSimulation,
    action: 'pause' | 'resume' | 'stop',
    resultCode: string,
  ): Promise<void> {
    active.controlOrdinal += 1;
    const ordinal = active.controlOrdinal;
    await this.timeline.append(active.runId, {
      logicalEventId: `simulation.${action}.${ordinal}`,
      logicalEntityKey: 'simulation',
      simulatedAt: this.simulatedDate(active),
      participantKey: 'manual',
      domain: 'lab',
      action: `simulation.${action}`,
      resultCode,
      entityType: 'SimulationRun',
      entityId: active.runId,
      correlationId: `${active.runId}:${action}:${ordinal}`,
      summary: `Ejecución ${action}`,
    });
  }

  private async buildDiagnostics(
    runId: string,
    active: ActiveSimulation | undefined,
    persisted: PersistedSimulationRuntimeState | undefined,
  ): Promise<SimulationRunDiagnostics> {
    const state = active?.state ?? persisted;
    const restaurantId =
      active?.bootstrap.restaurant.id ??
      (
        await this.prisma.simulationRun.findUnique({
          where: { id: runId },
          select: { restaurantId: true },
        })
      )?.restaurantId;

    const ordersByStatus =
      restaurantId == null
        ? []
        : (
            await this.prisma.order.groupBy({
              by: ['status'],
              where: { restaurantId },
              _count: { _all: true },
            })
          ).map((row) => ({
            status: row.status,
            count: row._count._all,
          }));

    const stock =
      restaurantId == null
        ? []
        : (
            await this.prisma.inventoryItem.findMany({
              where: { restaurantId },
              select: {
                id: true,
                name: true,
                currentStock: true,
                minStock: true,
                autoDisableDishes: true,
              },
              orderBy: { name: 'asc' },
            })
          ).map((item) => ({
            id: item.id,
            name: item.name,
            currentStock: item.currentStock,
            minStock: item.minStock,
            autoDisableDishes: item.autoDisableDishes,
          }));

    return {
      incidentCodes: state?.incidentCodes ?? [],
      observedIncidents: state?.observedIncidents ?? [],
      kitchenDelayMinutes: state?.kitchenDelayMinutes ?? 0,
      pendingEventIds: (active?.queue.snapshot() ?? state?.queue ?? []).map(
        (event) => event.id,
      ),
      ordersByStatus,
      stock,
      stockConsumed: state?.stockConsumed === true,
      incidentFingerprint: state?.incidentFingerprint ?? null,
    };
  }

  private simulatedDate(
    active: ActiveSimulation,
    atMs = active.elapsedMs,
  ): Date {
    return new Date(active.simulatedStartAt.getTime() + atMs);
  }

  private requireActive(runId: string): ActiveSimulation {
    const active = this.activeRuns.get(runId);
    if (!active) {
      throw new Error(
        `La ejecución ${runId} no está activa en este proceso de Bentoo Lab`,
      );
    }
    return active;
  }

  private clearTimer(active: ActiveSimulation): void {
    if (active.timer) {
      clearInterval(active.timer);
      active.timer = undefined;
    }
  }

  private async waitForIdle(active: ActiveSimulation): Promise<void> {
    while (active.ticking) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private roundToMinute(date: Date): Date {
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    return rounded;
  }

  private assertNever(event: never): never {
    throw new Error(
      `Evento no soportado por el runtime: ${JSON.stringify(
        event as LabScenarioEvent,
      )}`,
    );
  }
}
