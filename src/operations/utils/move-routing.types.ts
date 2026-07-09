import type { CoordinationPriority, CoordinationType } from '@prisma/client';
import type {
  ContextRef,
  Participant,
  ParticipantTargetType,
} from '../types/operations.types';

export type IntelligenceMoveTarget = {
  targetType: ParticipantTargetType;
  targetId: string;
};

export interface IntelligenceMoveInput {
  preparationId: string;
  situationType?: string;
  situationId?: string;
  type: CoordinationType;
  priority?: CoordinationPriority;
  title: string;
  description?: string;
  contextRef?: ContextRef;
  target: IntelligenceMoveTarget;
  suggestedActions?: Array<{ id: string; label: string; actionType?: string }>;
  expectedImpact?: {
    metric: string;
    deltaMinutes?: number;
    unit?: string;
  };
  ackDeadlineMinutes?: number;
}

export function moveRoutingDedupeKey(
  shiftId: string,
  preparationId: string,
): string {
  return `move:${shiftId}:${preparationId}`;
}

export function resolveMoveParticipant(
  target: IntelligenceMoveTarget,
  roster: Array<{
    userId: string;
    roleCode?: string;
    stationId?: string;
    responsibilities?: string[];
  }>,
): Participant {
  if (target.targetType === 'USER') {
    return {
      targetType: 'USER',
      targetId: target.targetId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }

  if (target.targetType === 'RESPONSIBILITY') {
    const user = roster.find((a) =>
      (a.responsibilities ?? []).includes(target.targetId),
    );
    if (user) {
      return {
        targetType: 'USER',
        targetId: user.userId,
        participantRole: 'ASSIGNEE',
        ackRequired: false,
      };
    }
    return {
      targetType: 'RESPONSIBILITY',
      targetId: target.targetId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }

  if (target.targetType === 'STATION') {
    const onStation = roster.find((a) => a.stationId === target.targetId);
    if (onStation) {
      return {
        targetType: 'USER',
        targetId: onStation.userId,
        participantRole: 'ASSIGNEE',
        ackRequired: false,
      };
    }
    return {
      targetType: 'STATION',
      targetId: target.targetId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }

  const byRole = roster.find(
    (a) => (a.roleCode ?? '').toUpperCase() === target.targetId.toUpperCase(),
  );
  if (byRole) {
    return {
      targetType: 'USER',
      targetId: byRole.userId,
      participantRole: 'ASSIGNEE',
      ackRequired: false,
    };
  }
  return {
    targetType: 'ROLE',
    targetId: target.targetId,
    participantRole: 'ASSIGNEE',
    ackRequired: false,
  };
}
