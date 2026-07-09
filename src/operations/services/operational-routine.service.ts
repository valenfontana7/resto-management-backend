import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { BusinessEventBusService } from '../../business-events/business-event-bus.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import type {
  BentooBusinessEvent,
  BusinessEventSubscriber,
} from '../../business-events/types/business-event.types';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { CoordinationService } from './coordination.service';
import {
  getOperationRoutines,
  mergeOperationRoutines,
  type OperationRoutinesConfig,
  type OperationalRoutineDefinition,
} from '../utils/operation-routines';
import { resolveMoveParticipant } from '../utils/move-routing.types';

@Injectable()
export class OperationalRoutineService
  implements OnModuleInit, BusinessEventSubscriber
{
  readonly id = 'operations-routines';
  readonly eventTypes = [
    BentooBusinessEventType.ShiftOpened,
    BentooBusinessEventType.ShiftClosingStarted,
  ] as const;

  private readonly logger = new Logger(OperationalRoutineService.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly coordinations: CoordinationService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    try {
      const trigger =
        event.eventType === BentooBusinessEventType.ShiftOpened
          ? 'SHIFT_OPENED'
          : event.eventType === BentooBusinessEventType.ShiftClosingStarted
            ? 'SHIFT_CLOSING_STARTED'
            : null;
      if (!trigger) return;

      const payload = event.payload as { shiftId?: string };
      if (!payload.shiftId) return;

      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: event.restaurantId },
        select: { businessRules: true },
      });
      const config = getOperationRoutines(restaurant?.businessRules);
      const routines = config.routines.filter(
        (routine) => routine.enabled && routine.trigger === trigger,
      );
      if (routines.length === 0) return;

      for (const routine of routines) {
        await this.executeRoutine(event.restaurantId, payload.shiftId, routine);
      }
    } catch (error) {
      this.logger.warn(
        `Routine handler failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async get(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    const config = getOperationRoutines(restaurant?.businessRules);
    return {
      routines: config.routines,
      isDefault: !this.hasCustomRoutines(restaurant?.businessRules),
    };
  }

  async replace(
    restaurantId: string,
    userId: string,
    config: OperationRoutinesConfig,
  ) {
    await this.ownership.verifyUserRole(restaurantId, userId, [
      'OWNER',
      'MANAGER',
      'ADMIN',
      'SUPER_ADMIN',
    ]);
    this.assertValidConfig(config);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        businessRules: mergeOperationRoutines(
          restaurant?.businessRules,
          config,
        ) as object,
      },
    });

    return { routines: config.routines };
  }

  private async executeRoutine(
    restaurantId: string,
    shiftId: string,
    routine: OperationalRoutineDefinition,
  ) {
    if (routine.autonomyLevel < 3) return;

    const shift = await this.prisma.operationShift.findFirst({
      where: { id: shiftId, restaurantId },
    });
    if (!shift) return;

    const roster = Array.isArray(shift.assignments)
      ? (shift.assignments as Array<{
          userId: string;
          roleCode?: string;
          stationId?: string;
          responsibilities?: string[];
        }>)
      : [];

    const participant = resolveMoveParticipant(
      {
        targetType: routine.target.targetType,
        targetId: routine.target.targetId,
      },
      roster,
    );

    const result = await this.coordinations.createFromPolicy({
      restaurantId,
      shiftId,
      type: routine.type,
      priority: routine.priority,
      title: routine.title,
      description: routine.description,
      contextRef: {
        type: 'DAILY_OPERATION',
        id: shiftId,
        label: routine.title,
      },
      origin: {
        kind: 'INTELLIGENCE',
        situationType: `routine:${routine.id}`,
        sourceEventType: 'OperationalRoutine',
      },
      participants: [{ ...participant, ackRequired: false }],
      policyDedupeKey: `routine:${shiftId}:${routine.id}`,
    });

    if (result.deduped) {
      this.logger.debug(`Routine ${routine.id} deduped for shift ${shiftId}`);
    }
  }

  private assertValidConfig(config: OperationRoutinesConfig): void {
    for (const routine of config.routines) {
      if (!routine.id?.trim() || !routine.title?.trim()) {
        throw new BadRequestException('Cada rutina necesita id y título');
      }
      if (routine.autonomyLevel !== 2 && routine.autonomyLevel !== 3) {
        throw new BadRequestException('autonomyLevel debe ser 2 o 3');
      }
    }
  }

  private hasCustomRoutines(businessRules: unknown): boolean {
    const rules =
      businessRules && typeof businessRules === 'object'
        ? (businessRules as Record<string, unknown>)
        : null;
    const operations =
      rules?.operations && typeof rules.operations === 'object'
        ? (rules.operations as Record<string, unknown>)
        : null;
    return operations?.routines != null;
  }
}
