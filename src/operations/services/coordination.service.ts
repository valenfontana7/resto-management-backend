import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CoordinationPriority,
  CoordinationStatus,
  CoordinationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { BusinessEventPublisherService } from '../../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import { ShiftService } from './shift.service';
import { EpisodeLoggingService } from './episode-logging.service';
import {
  Declare86Dto,
  DeclareIncidentDto,
  HelpRequestDto,
  OpenCoordinationDto,
  RejectCoordinationDto,
  RequestApprovalDto,
  ResolveCoordinationDto,
} from '../dto/operations.dto';
import type {
  ContextRef,
  CoordinationOrigin,
  CoordinationResult,
  Participant,
} from '../types/operations.types';
import { ACTIVE_COORDINATION_STATUSES } from '../types/operations.types';
import { resolveAckDeadlineMinutes } from '../utils/operation-escalation';

type EvidenceItem = {
  kind: 'PHOTO';
  key: string;
  uploadedByUserId: string;
  at: string;
};

function asEvidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value as EvidenceItem[];
}

function asParticipants(value: unknown): Participant[] {
  if (!Array.isArray(value)) return [];
  return value as Participant[];
}

function asContextRef(value: unknown): ContextRef {
  return value as ContextRef;
}

function asOrigin(value: unknown): CoordinationOrigin {
  return value as CoordinationOrigin;
}

@Injectable()
export class CoordinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly shifts: ShiftService,
    private readonly episodes: EpisodeLoggingService,
  ) {}

  async open(restaurantId: string, userId: string, dto: OpenCoordinationDto) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireOpenShift(restaurantId);

    const participants: Participant[] = dto.participants.map((p) => ({
      targetType: p.targetType as Participant['targetType'],
      targetId: p.targetId,
      participantRole: p.participantRole as Participant['participantRole'],
      ackRequired: p.ackRequired ?? p.participantRole === 'WATCHER',
    }));

    if (dto.type === CoordinationType.APPROVAL) {
      const hasApprover = participants.some(
        (p) => p.participantRole === 'APPROVER',
      );
      if (!hasApprover) {
        throw new BadRequestException('APPROVAL requiere un APPROVER');
      }
    }

    const priority = dto.priority ?? CoordinationPriority.NORMAL;
    const businessRules = await this.getBusinessRules(restaurantId);
    const ackMinutes = resolveAckDeadlineMinutes(
      businessRules,
      priority,
      dto.ackDeadlineMinutes,
    );
    const ackDeadlineAt =
      dto.type === CoordinationType.HEADS_UP ||
      dto.type === CoordinationType.APPROVAL
        ? new Date(Date.now() + ackMinutes * 60_000)
        : null;

    const origin: CoordinationOrigin = {
      kind: 'HUMAN',
      createdByUserId: userId,
    };

    const created = await this.prisma.coordination.create({
      data: {
        restaurantId,
        shiftId: shift.id,
        type: dto.type,
        priority,
        title: dto.title,
        description: dto.description,
        contextRef: dto.contextRef as unknown as Prisma.InputJsonValue,
        origin: origin as unknown as Prisma.InputJsonValue,
        participants: participants as unknown as Prisma.InputJsonValue,
        attentionLevel: 1,
        ackDeadlineAt,
      },
    });

    this.emitOpened(created, restaurantId);
    return { coordination: this.serialize(created) };
  }

  async declare86(restaurantId: string, userId: string, dto: Declare86Dto) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireOpenShift(restaurantId);

    return this.createFromPolicy({
      restaurantId,
      shiftId: shift.id,
      type: CoordinationType.HEADS_UP,
      priority: CoordinationPriority.HIGH,
      title: `Sin ${dto.dishName}`,
      description: 'Plato agotado — confirmar recepción',
      contextRef: {
        type: 'DISH',
        id: dto.dishId,
        label: dto.dishName,
        deepLink: '/admin/menu',
      },
      origin: {
        kind: 'HUMAN',
        createdByUserId: userId,
        sourceEventType: 'ProductOutOfStock',
      },
      participants: [
        {
          targetType: 'ROLE',
          targetId: 'WAITER',
          participantRole: 'WATCHER',
          ackRequired: true,
        },
      ],
      policyDedupeKey: `86:${shift.id}:${dto.dishId}`,
    });
  }

  async declareIncident(
    restaurantId: string,
    userId: string,
    dto: DeclareIncidentDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireOpenShift(restaurantId);
    const leadId = this.shifts.getShiftLeadUserId(shift);

    const evidence: EvidenceItem[] = (dto.evidenceKeys ?? []).map((key) => ({
      kind: 'PHOTO',
      key,
      uploadedByUserId: userId,
      at: new Date().toISOString(),
    }));

    const priority =
      dto.priority === CoordinationPriority.CRITICAL
        ? CoordinationPriority.CRITICAL
        : CoordinationPriority.HIGH;

    const contextRef: ContextRef = dto.contextRef
      ? (dto.contextRef as ContextRef)
      : {
          type: 'NONE',
          id: dto.stationId ? `station:${dto.stationId}` : 'incident',
          label: dto.stationId ? `Estación ${dto.stationId}` : 'Incidencia',
        };

    const participants: Participant[] = [
      {
        targetType: 'USER',
        targetId: userId,
        participantRole: 'REQUESTER',
        ackRequired: false,
      },
      {
        targetType: leadId ? 'USER' : 'RESPONSIBILITY',
        targetId: leadId ?? 'SHIFT_LEAD',
        participantRole: 'ASSIGNEE',
        ackRequired: false,
      },
    ];

    if (dto.stationId) {
      participants.push({
        targetType: 'STATION',
        targetId: dto.stationId,
        participantRole: 'WATCHER',
        ackRequired: false,
      });
    }

    const businessRules = await this.getBusinessRules(restaurantId);
    const ackMinutes = resolveAckDeadlineMinutes(businessRules, priority);

    const created = await this.prisma.coordination.create({
      data: {
        restaurantId,
        shiftId: shift.id,
        type: CoordinationType.INCIDENT,
        priority,
        title: dto.title,
        description: dto.description,
        contextRef: contextRef as unknown as Prisma.InputJsonValue,
        origin: {
          kind: 'HUMAN',
          createdByUserId: userId,
        } as unknown as Prisma.InputJsonValue,
        participants: participants as unknown as Prisma.InputJsonValue,
        attentionLevel: priority === CoordinationPriority.CRITICAL ? 2 : 1,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        ackDeadlineAt: new Date(Date.now() + ackMinutes * 60_000),
      },
    });

    this.emitOpened(created, restaurantId);
    return { coordination: this.serialize(created) };
  }

  async requestApproval(
    restaurantId: string,
    userId: string,
    dto: RequestApprovalDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireOpenShift(restaurantId);
    const leadId = this.shifts.getShiftLeadUserId(shift);

    const created = await this.createFromPolicy({
      restaurantId,
      shiftId: shift.id,
      type: CoordinationType.APPROVAL,
      priority: CoordinationPriority.HIGH,
      title: dto.title,
      description: dto.description,
      contextRef: dto.contextRef as ContextRef,
      origin: { kind: 'HUMAN', createdByUserId: userId },
      participants: [
        {
          targetType: 'USER',
          targetId: userId,
          participantRole: 'REQUESTER',
          ackRequired: false,
        },
        {
          targetType: leadId ? 'USER' : 'RESPONSIBILITY',
          targetId: leadId ?? 'SHIFT_LEAD',
          participantRole: 'APPROVER',
          ackRequired: false,
        },
      ],
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ApprovalRequested,
      restaurantId,
      source: 'operations.coordination',
      correlationId: `approval-requested:${created.coordination.id}`,
      payload: {
        coordinationId: created.coordination.id,
        requesterUserId: userId,
        amount: dto.amount,
        contextRef: {
          type: dto.contextRef.type,
          id: dto.contextRef.id,
          label: dto.contextRef.label,
        },
      },
    });

    return created;
  }

  async requestHelp(restaurantId: string, userId: string, dto: HelpRequestDto) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireOpenShift(restaurantId);
    const leadId = this.shifts.getShiftLeadUserId(shift);

    const created = await this.createFromPolicy({
      restaurantId,
      shiftId: shift.id,
      type: CoordinationType.HELP_REQUEST,
      priority: CoordinationPriority.NORMAL,
      title: dto.title,
      description: dto.description,
      contextRef: {
        type: 'NONE',
        id: 'help',
        label: dto.stationId ? `Estación ${dto.stationId}` : 'Ayuda',
      },
      origin: { kind: 'HUMAN', createdByUserId: userId },
      participants: [
        {
          targetType: 'USER',
          targetId: userId,
          participantRole: 'REQUESTER',
          ackRequired: false,
        },
        {
          targetType: leadId ? 'USER' : 'RESPONSIBILITY',
          targetId: leadId ?? 'SHIFT_LEAD',
          participantRole: 'ASSIGNEE',
          ackRequired: false,
        },
      ],
      ackDeadlineMinutes: 3,
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.HelpRequested,
      restaurantId,
      source: 'operations.coordination',
      correlationId: `help:${created.coordination.id}`,
      payload: {
        coordinationId: created.coordination.id,
        requesterUserId: userId,
        stationId: dto.stationId,
      },
    });

    return created;
  }

  async acknowledge(
    restaurantId: string,
    userId: string,
    coordinationId: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const coord = await this.requireCoordination(restaurantId, coordinationId);

    if (
      !ACTIVE_COORDINATION_STATUSES.includes(
        coord.status as (typeof ACTIVE_COORDINATION_STATUSES)[number],
      )
    ) {
      throw new BadRequestException('La coordinación ya está cerrada');
    }

    const participants = asParticipants(coord.participants).map((p) => {
      if (
        (p.targetType === 'USER' && p.targetId === userId) ||
        p.targetType === 'ROLE' ||
        p.targetType === 'RESPONSIBILITY'
      ) {
        if (p.ackRequired && !p.ackedAt) {
          return {
            ...p,
            ackedAt: new Date().toISOString(),
            ackedByUserId: userId,
          };
        }
      }
      return p;
    });

    const allAcked = participants
      .filter((p) => p.ackRequired)
      .every((p) => Boolean(p.ackedAt));

    let status = coord.status;
    if (status === CoordinationStatus.OPEN) {
      status = CoordinationStatus.ACKNOWLEDGED;
    }

    let result: CoordinationResult | null = null;
    if (coord.type === CoordinationType.HEADS_UP && allAcked) {
      status = CoordinationStatus.RESOLVED;
      result = {
        outcome: 'NO_EFFECT',
        summary: 'Todos confirmaron recepción',
        closedAt: new Date().toISOString(),
        closedByUserId: userId,
      };
    }

    const updated = await this.prisma.coordination.update({
      where: { id: coord.id },
      data: {
        participants: participants as unknown as Prisma.InputJsonValue,
        status,
        result: result
          ? (result as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.CoordinationAcknowledged,
      restaurantId,
      source: 'operations.coordination',
      payload: { coordinationId: coord.id, userId },
    });

    if (result) {
      await this.finalizeClosed(updated, restaurantId, result);
    }

    return { coordination: this.serialize(updated) };
  }

  async resolve(
    restaurantId: string,
    userId: string,
    coordinationId: string,
    dto: ResolveCoordinationDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const coord = await this.requireCoordination(restaurantId, coordinationId);

    if (
      !ACTIVE_COORDINATION_STATUSES.includes(
        coord.status as (typeof ACTIVE_COORDINATION_STATUSES)[number],
      )
    ) {
      throw new BadRequestException('La coordinación ya está cerrada');
    }

    let evidence = asEvidence(coord.evidence);
    if (dto.evidenceKeys?.length) {
      evidence = [
        ...evidence,
        ...dto.evidenceKeys.map((key) => ({
          kind: 'PHOTO' as const,
          key,
          uploadedByUserId: userId,
          at: new Date().toISOString(),
        })),
      ];
    }

    if (coord.type === CoordinationType.INCIDENT) {
      if (!dto.summary?.trim()) {
        throw new BadRequestException(
          'INCIDENT requiere un resumen al resolver',
        );
      }
      if (evidence.length < 1) {
        throw new BadRequestException(
          'INCIDENT requiere al menos una evidencia (foto)',
        );
      }
    }

    const result: CoordinationResult = {
      outcome: dto.outcome ?? 'RESOLVED',
      summary: dto.summary,
      evidenceRefs: evidence.map((e) => e.key),
      measuredImpact: dto.measuredImpact,
      closedAt: new Date().toISOString(),
      closedByUserId: userId,
    };

    const updated = await this.prisma.coordination.update({
      where: { id: coord.id },
      data: {
        status: CoordinationStatus.RESOLVED,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });

    if (coord.type === CoordinationType.APPROVAL) {
      void this.businessEvents.publish({
        eventType: BentooBusinessEventType.ApprovalResolved,
        restaurantId,
        source: 'operations.coordination',
        payload: {
          coordinationId: coord.id,
          approved: true,
          resolverUserId: userId,
        },
      });
    }

    await this.finalizeClosed(updated, restaurantId, result);
    return { coordination: this.serialize(updated) };
  }

  async reject(
    restaurantId: string,
    userId: string,
    coordinationId: string,
    dto: RejectCoordinationDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const coord = await this.requireCoordination(restaurantId, coordinationId);

    const result: CoordinationResult = {
      outcome:
        coord.type === CoordinationType.APPROVAL ? 'REJECTED' : 'DECLINED',
      summary: dto.reason,
      closedAt: new Date().toISOString(),
      closedByUserId: userId,
    };

    const updated = await this.prisma.coordination.update({
      where: { id: coord.id },
      data: {
        status: CoordinationStatus.REJECTED,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });

    if (coord.type === CoordinationType.APPROVAL) {
      void this.businessEvents.publish({
        eventType: BentooBusinessEventType.ApprovalResolved,
        restaurantId,
        source: 'operations.coordination',
        payload: {
          coordinationId: coord.id,
          approved: false,
          resolverUserId: userId,
        },
      });
    } else {
      void this.businessEvents.publish({
        eventType: BentooBusinessEventType.CoordinationDeclined,
        restaurantId,
        source: 'operations.coordination',
        payload: { coordinationId: coord.id, reason: dto.reason },
      });
    }

    await this.finalizeClosed(updated, restaurantId, result);
    return { coordination: this.serialize(updated) };
  }

  async escalate(restaurantId: string, userId: string, coordinationId: string) {
    if (userId !== 'system') {
      await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    }
    return this.escalateInternal(restaurantId, coordinationId);
  }

  private async escalateInternal(restaurantId: string, coordinationId: string) {
    const coord = await this.requireCoordination(restaurantId, coordinationId);
    const shift = await this.shifts.requireShift(restaurantId, coord.shiftId);
    const leadId = this.shifts.getShiftLeadUserId(shift);

    if (coord.status === CoordinationStatus.ESCALATED) {
      return { coordination: this.serialize(coord) };
    }

    const participants = asParticipants(coord.participants);
    if (
      leadId &&
      !participants.some(
        (p) => p.targetType === 'USER' && p.targetId === leadId,
      )
    ) {
      participants.push({
        targetType: 'USER',
        targetId: leadId,
        participantRole: 'OWNER',
        ackRequired: false,
      });
    }

    const updated = await this.prisma.coordination.update({
      where: { id: coord.id },
      data: {
        status: CoordinationStatus.ESCALATED,
        escalatedAt: new Date(),
        escalatedToShiftLead: true,
        attentionLevel: 2,
        priority:
          coord.priority === CoordinationPriority.CRITICAL
            ? coord.priority
            : CoordinationPriority.HIGH,
        participants: participants as unknown as Prisma.InputJsonValue,
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.CoordinationEscalated,
      restaurantId,
      source: 'operations.coordination',
      payload: {
        coordinationId: coord.id,
        escalatedToUserId: leadId ?? undefined,
      },
    });

    return { coordination: this.serialize(updated) };
  }

  /** Used by policies — idempotent via policyDedupeKey. */
  async createFromPolicy(input: {
    restaurantId: string;
    shiftId: string;
    type: CoordinationType;
    priority: CoordinationPriority;
    title: string;
    description?: string;
    contextRef: ContextRef;
    origin: CoordinationOrigin;
    participants: Participant[];
    policyDedupeKey?: string;
    ackDeadlineMinutes?: number;
  }) {
    if (input.policyDedupeKey) {
      const existing = await this.prisma.coordination.findFirst({
        where: {
          restaurantId: input.restaurantId,
          policyDedupeKey: input.policyDedupeKey,
        },
      });
      if (existing) {
        return { coordination: this.serialize(existing), deduped: true };
      }
    }

    const ackMinutes = resolveAckDeadlineMinutes(
      await this.getBusinessRules(input.restaurantId),
      input.priority,
      input.ackDeadlineMinutes,
    );
    const needsAckDeadline =
      input.type === CoordinationType.HEADS_UP ||
      input.type === CoordinationType.APPROVAL;
    const ackDeadlineAt = needsAckDeadline
      ? new Date(Date.now() + ackMinutes * 60_000)
      : null;

    try {
      const created = await this.prisma.coordination.create({
        data: {
          restaurantId: input.restaurantId,
          shiftId: input.shiftId,
          type: input.type,
          priority: input.priority,
          title: input.title,
          description: input.description,
          contextRef: input.contextRef as unknown as Prisma.InputJsonValue,
          origin: input.origin as unknown as Prisma.InputJsonValue,
          participants: input.participants as unknown as Prisma.InputJsonValue,
          attentionLevel: 1,
          ackDeadlineAt,
          policyDedupeKey: input.policyDedupeKey,
        },
      });
      this.emitOpened(created, input.restaurantId);
      return { coordination: this.serialize(created), deduped: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.policyDedupeKey
      ) {
        const existing = await this.prisma.coordination.findFirst({
          where: {
            restaurantId: input.restaurantId,
            policyDedupeKey: input.policyDedupeKey,
          },
        });
        if (existing) {
          return { coordination: this.serialize(existing), deduped: true };
        }
      }
      throw error;
    }
  }

  async listForShift(restaurantId: string, userId: string, shiftId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const rows = await this.prisma.coordination.findMany({
      where: { restaurantId, shiftId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return { coordinations: rows.map((r) => this.serialize(r)) };
  }

  async expireOverdue(): Promise<number> {
    const now = new Date();
    const overdue = await this.prisma.coordination.findMany({
      where: {
        status: {
          in: [
            CoordinationStatus.OPEN,
            CoordinationStatus.ACKNOWLEDGED,
            CoordinationStatus.IN_PROGRESS,
          ],
        },
        ackDeadlineAt: { lt: now },
        escalatedToShiftLead: false,
      },
      take: 50,
    });

    let count = 0;
    for (const coord of overdue) {
      await this.escalateInternal(coord.restaurantId, coord.id).catch(
        () => undefined,
      );
      count += 1;
    }
    return count;
  }

  private async finalizeClosed(
    coord: {
      id: string;
      restaurantId: string;
      shiftId: string;
      type: CoordinationType;
      participants: unknown;
      escalatedToShiftLead: boolean;
      createdAt: Date;
      origin: unknown;
    },
    restaurantId: string,
    result: CoordinationResult,
  ) {
    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.CoordinationCompleted,
      restaurantId,
      source: 'operations.coordination',
      payload: {
        coordinationId: coord.id,
        outcome: result.outcome,
        resultSummary: result.summary,
      },
    });

    const origin = asOrigin(coord.origin);
    const shift = await this.prisma.operationShift.findUnique({
      where: { id: coord.shiftId },
    });
    if (!shift) return;

    await this.episodes.logCoordinationClosed({
      restaurantId,
      shiftId: coord.shiftId,
      businessDate: shift.businessDate,
      coordinationId: coord.id,
      coordinationType: coord.type,
      participants: asParticipants(coord.participants),
      result,
      wasEscalated: coord.escalatedToShiftLead,
      createdAt: coord.createdAt,
      sourceEventIds: origin.sourceEventId ? [origin.sourceEventId] : [],
      situationType: origin.situationType,
      preparationId: origin.preparationId,
      daypart: shift.segment,
    });
  }

  private emitOpened(
    created: {
      id: string;
      type: CoordinationType;
      priority: CoordinationPriority;
      shiftId: string;
      contextRef: unknown;
      title: string;
    },
    restaurantId: string,
  ) {
    const contextRef = asContextRef(created.contextRef);
    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.CoordinationOpened,
      restaurantId,
      source: 'operations.coordination',
      correlationId: `coordination-opened:${created.id}`,
      payload: {
        coordinationId: created.id,
        type: created.type,
        priority: created.priority,
        shiftId: created.shiftId,
        contextRef: {
          type: contextRef.type,
          id: contextRef.id,
          label: contextRef.label,
        },
        title: created.title,
      },
    });
  }

  private async getBusinessRules(restaurantId: string): Promise<unknown> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    return restaurant?.businessRules;
  }

  private async requireCoordination(
    restaurantId: string,
    coordinationId: string,
  ) {
    const coord = await this.prisma.coordination.findFirst({
      where: { id: coordinationId, restaurantId },
    });
    if (!coord) throw new NotFoundException('Coordinación no encontrada');
    return coord;
  }

  serialize(coord: {
    id: string;
    restaurantId: string;
    shiftId: string;
    type: CoordinationType;
    status: CoordinationStatus;
    priority: CoordinationPriority;
    title: string;
    description: string | null;
    contextRef: unknown;
    origin: unknown;
    participants: unknown;
    attentionLevel: number;
    ackDeadlineAt: Date | null;
    escalatedAt: Date | null;
    escalatedToShiftLead: boolean;
    evidence?: unknown;
    result: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: coord.id,
      restaurantId: coord.restaurantId,
      shiftId: coord.shiftId,
      type: coord.type,
      status: coord.status,
      priority: coord.priority,
      title: coord.title,
      description: coord.description,
      contextRef: asContextRef(coord.contextRef),
      origin: asOrigin(coord.origin),
      originKind: asOrigin(coord.origin).kind,
      participants: asParticipants(coord.participants),
      attentionLevel: coord.attentionLevel,
      ackDeadlineAt: coord.ackDeadlineAt?.toISOString() ?? null,
      escalatedAt: coord.escalatedAt?.toISOString() ?? null,
      escalatedToShiftLead: coord.escalatedToShiftLead,
      evidence: asEvidence(coord.evidence),
      result: coord.result,
      createdAt: coord.createdAt.toISOString(),
      updatedAt: coord.updatedAt.toISOString(),
    };
  }
}
