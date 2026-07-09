import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CoordinationPriority,
  CoordinationType,
  OperationShiftStatus,
} from '@prisma/client';
import { BusinessEventBusService } from '../../business-events/business-event-bus.service';
import { BusinessEventPublisherService } from '../../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import type {
  BentooBusinessEvent,
  BusinessEventSubscriber,
} from '../../business-events/types/business-event.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CoordinationService } from './coordination.service';
import { ResolutionMemoryService } from './resolution-memory.service';
import { TacticBenchmarkService } from './tactic-benchmark.service';
import type { IntelligenceMovePreparedPayload } from '../../business-events/types/payloads';
import {
  moveRoutingDedupeKey,
  resolveMoveParticipant,
  type IntelligenceMoveInput,
} from '../utils/move-routing.types';
import type { ContextRef, ShiftAssignment } from '../types/operations.types';

/**
 * Fase 2: Preparation / Intelligence Move → Coordination en La Línea.
 * Escucha IntelligenceMovePrepared; idempotente por preparationId + shiftId.
 */
@Injectable()
export class MoveRoutingService
  implements OnModuleInit, BusinessEventSubscriber
{
  readonly id = 'operations-move-routing';
  readonly eventTypes = [
    BentooBusinessEventType.IntelligenceMovePrepared,
  ] as const;

  private readonly logger = new Logger(MoveRoutingService.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly prisma: PrismaService,
    private readonly coordinations: CoordinationService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly resolutionMemory: ResolutionMemoryService,
    private readonly tacticBenchmarks: TacticBenchmarkService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    if (event.eventType !== BentooBusinessEventType.IntelligenceMovePrepared) {
      return;
    }
    try {
      const payload = event.payload as IntelligenceMovePreparedPayload;
      if (!payload.preparationId || !payload.title || !payload.type) return;
      const contextRef: ContextRef | undefined = payload.contextRef
        ? {
            type: payload.contextRef.type as ContextRef['type'],
            id: payload.contextRef.id,
            label: payload.contextRef.label,
            deepLink: payload.contextRef.deepLink,
          }
        : undefined;
      await this.route(
        event.restaurantId,
        {
          preparationId: payload.preparationId,
          situationType: payload.situationType,
          situationId: payload.situationId,
          type: payload.type as CoordinationType,
          priority: payload.priority as CoordinationPriority | undefined,
          title: payload.title,
          description: payload.description,
          contextRef,
          target: {
            targetType: payload.target
              .targetType as IntelligenceMoveInput['target']['targetType'],
            targetId: payload.target.targetId,
          },
          suggestedActions: payload.suggestedActions,
          expectedImpact: payload.expectedImpact,
          ackDeadlineMinutes: payload.ackDeadlineMinutes,
        },
        event.id,
      );
    } catch (error) {
      this.logger.warn(
        `Move routing failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Publica el evento spine y deja que el subscriber materialice la coordinación. */
  async publishAndRoute(
    restaurantId: string,
    input: IntelligenceMoveInput,
  ): Promise<{ published: true; preparationId: string }> {
    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.IntelligenceMovePrepared,
      restaurantId,
      source: 'operations.move-routing',
      correlationId: `intelligence-move:${input.preparationId}`,
      payload: input,
    });
    return { published: true, preparationId: input.preparationId };
  }

  async route(
    restaurantId: string,
    input: IntelligenceMoveInput,
    sourceEventId?: string,
  ) {
    const shift = await this.prisma.operationShift.findFirst({
      where: {
        restaurantId,
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) {
      return { routed: false, reason: 'NO_OPEN_SHIFT' as const };
    }

    const roster = Array.isArray(shift.assignments)
      ? (shift.assignments as unknown as ShiftAssignment[])
      : [];

    const participant = resolveMoveParticipant(input.target, roster);
    const contextRef = input.contextRef ?? {
      type: 'SITUATION' as const,
      id: input.situationId ?? input.preparationId,
      label: input.title,
    };

    const precedent = await this.resolutionMemory.getPrecedent(
      restaurantId,
      input.situationType,
      shift.segment,
    );
    const adjusted = this.resolutionMemory.applyRoutingAdjustments(
      {
        priority: input.priority ?? undefined,
        description: input.description,
        situationType: input.situationType,
      },
      precedent,
    );

    let description = adjusted.description;
    const network = await this.tacticBenchmarks.getBenchmarkForRouting(
      restaurantId,
      input.situationType,
    );
    if (network?.comparison) {
      description = description
        ? `${description}\nRed: ${network.comparison}`
        : `Red: ${network.comparison}`;
    }

    const result = await this.coordinations.createFromPolicy({
      restaurantId,
      shiftId: shift.id,
      type: input.type,
      priority: adjusted.priority,
      title: input.title,
      description,
      contextRef,
      origin: {
        kind: 'INTELLIGENCE',
        sourceEventType: BentooBusinessEventType.IntelligenceMovePrepared,
        sourceEventId,
        preparationId: input.preparationId,
        situationType: input.situationType,
      },
      participants: [participant],
      policyDedupeKey: moveRoutingDedupeKey(shift.id, input.preparationId),
      ackDeadlineMinutes: input.ackDeadlineMinutes ?? 10,
    });

    return {
      routed: !result.deduped,
      deduped: result.deduped,
      coordination: result.coordination,
      shiftId: shift.id,
      precedent: adjusted.precedent,
      suppressed: adjusted.suppressed,
    };
  }
}
