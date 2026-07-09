import { Injectable } from '@nestjs/common';
import { CoordinationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { ShiftService } from './shift.service';
import { CoordinationService } from './coordination.service';
import type { Participant } from '../types/operations.types';
import {
  ACTIVE_COORDINATION_STATUSES,
  LINE_PUSH_BUDGET,
} from '../types/operations.types';

export type LineAction =
  | 'ack'
  | 'resolve'
  | 'approve'
  | 'reject'
  | 'escalate'
  | 'accept_help';

export interface LineItem {
  coordinationId: string;
  type: string;
  priority: string;
  title: string;
  description: string | null;
  contextRef: unknown;
  status: string;
  attentionLevel: number;
  myRole: string | null;
  availableActions: LineAction[];
  createdAt: string;
  ackDeadlineAt: string | null;
  pushed: boolean;
  originKind?: string | null;
}

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

@Injectable()
export class LineProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly shifts: ShiftService,
    private readonly coordinations: CoordinationService,
  ) {}

  async getLine(
    restaurantId: string,
    userId: string,
    opts?: { roleCode?: string },
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const current = await this.shifts.getCurrent(restaurantId, userId);
    if (!current.shift) {
      return {
        shift: null,
        items: [] as LineItem[],
        pushed: [] as LineItem[],
        queued: [] as LineItem[],
      };
    }

    const shiftId = current.shift.id;
    const roleCode = (opts?.roleCode ?? '').toUpperCase();
    const isLead = current.shift.shiftLeadUserId === userId;
    const assignments = Array.isArray(current.shift.assignments)
      ? (current.shift.assignments as Array<{
          userId: string;
          stationId?: string;
          responsibilities?: string[];
        }>)
      : [];
    const myStationIds = new Set(
      assignments
        .filter((a) => a.userId === userId && a.stationId)
        .map((a) => a.stationId as string),
    );
    const myResponsibilities = new Set(
      assignments
        .filter((a) => a.userId === userId)
        .flatMap((a) => a.responsibilities ?? []),
    );

    const rows = await this.prisma.coordination.findMany({
      where: {
        restaurantId,
        shiftId,
        status: { in: [...ACTIVE_COORDINATION_STATUSES] },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });

    const items: LineItem[] = [];

    for (const row of rows) {
      const serialized = this.coordinations.serialize(row);
      const participants = serialized.participants;
      const match = this.matchParticipant(
        participants,
        userId,
        roleCode,
        isLead,
        myStationIds,
        myResponsibilities,
      );
      if (!match && !isLead) continue;

      const myRole = match?.participantRole ?? (isLead ? 'OWNER' : null);
      const actions = this.resolveActions(
        serialized.type,
        serialized.status,
        myRole,
      );

      items.push({
        coordinationId: serialized.id,
        type: serialized.type,
        priority: serialized.priority,
        title: serialized.title,
        description: serialized.description,
        contextRef: serialized.contextRef,
        status: serialized.status,
        attentionLevel: serialized.attentionLevel,
        myRole,
        availableActions: actions,
        createdAt: serialized.createdAt,
        ackDeadlineAt: serialized.ackDeadlineAt,
        pushed: false,
        originKind: serialized.originKind ?? null,
      });
    }

    items.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 0;
      const pb = PRIORITY_RANK[b.priority] ?? 0;
      if (pb !== pa) return pb - pa;
      if (a.attentionLevel !== b.attentionLevel) {
        return b.attentionLevel - a.attentionLevel;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    const pushed = items.slice(0, LINE_PUSH_BUDGET).map((i) => ({
      ...i,
      pushed: true,
    }));
    const queued = items.slice(LINE_PUSH_BUDGET).map((i) => ({
      ...i,
      pushed: false,
    }));

    return {
      shift: current.shift,
      items: [...pushed, ...queued],
      pushed,
      queued,
      budget: LINE_PUSH_BUDGET,
    };
  }

  private matchParticipant(
    participants: Participant[],
    userId: string,
    roleCode: string,
    isLead: boolean,
    stationIds: Set<string>,
    responsibilities: Set<string>,
  ): Participant | undefined {
    const byUser = participants.find(
      (p) => p.targetType === 'USER' && p.targetId === userId,
    );
    if (byUser) return byUser;

    if (roleCode) {
      const byRole = participants.find(
        (p) => p.targetType === 'ROLE' && p.targetId.toUpperCase() === roleCode,
      );
      if (byRole) return byRole;
    }

    if (stationIds.size > 0) {
      const byStation = participants.find(
        (p) => p.targetType === 'STATION' && stationIds.has(p.targetId),
      );
      if (byStation) return byStation;
    }

    if (responsibilities.size > 0) {
      const byResponsibility = participants.find(
        (p) =>
          p.targetType === 'RESPONSIBILITY' && responsibilities.has(p.targetId),
      );
      if (byResponsibility) return byResponsibility;
    }

    if (isLead) {
      return participants.find(
        (p) =>
          p.targetType === 'RESPONSIBILITY' &&
          (p.targetId === 'SHIFT_LEAD' ||
            p.targetId === 'CASH_LEAD' ||
            p.targetId === 'CLOSING_LEAD'),
      );
    }

    return undefined;
  }

  private resolveActions(
    type: string,
    status: string,
    myRole: string | null,
  ): LineAction[] {
    if (
      status === CoordinationStatus.RESOLVED ||
      status === CoordinationStatus.REJECTED
    ) {
      return [];
    }

    const actions: LineAction[] = [];

    if (type === 'HEADS_UP' && (myRole === 'WATCHER' || myRole === 'OWNER')) {
      actions.push('ack');
    }
    if (type === 'APPROVAL' && (myRole === 'APPROVER' || myRole === 'OWNER')) {
      actions.push('approve', 'reject');
    }
    if (
      (type === 'TASK' || type === 'HELP_REQUEST' || type === 'INCIDENT') &&
      (myRole === 'ASSIGNEE' || myRole === 'OWNER')
    ) {
      actions.push('resolve');
    }
    if (
      type === 'HELP_REQUEST' &&
      (myRole === 'ASSIGNEE' || myRole === 'OWNER')
    ) {
      actions.push('accept_help');
    }
    if (myRole === 'OWNER' || myRole === 'APPROVER') {
      if (!actions.includes('escalate')) actions.push('escalate');
    }

    return actions;
  }
}
