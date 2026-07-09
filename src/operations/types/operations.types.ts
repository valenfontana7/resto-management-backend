export type ContextRefType =
  | 'ORDER'
  | 'TABLE_SESSION'
  | 'TABLE'
  | 'CASH_REGISTER_SESSION'
  | 'DISH'
  | 'INVENTORY_ITEM'
  | 'RESERVATION'
  | 'DELIVERY'
  | 'SITUATION'
  | 'PREPARATION'
  | 'DAILY_OPERATION'
  | 'NONE';

export interface ContextRef {
  type: ContextRefType;
  id: string;
  label?: string;
  deepLink?: string;
}

export type CoordinationOriginKind = 'EVENT' | 'HUMAN' | 'INTELLIGENCE';

export interface CoordinationOrigin {
  kind: CoordinationOriginKind;
  sourceEventType?: string;
  sourceEventId?: string;
  preparationId?: string;
  situationType?: string;
  createdByUserId?: string;
}

export type ParticipantRole =
  | 'OWNER'
  | 'ASSIGNEE'
  | 'APPROVER'
  | 'WATCHER'
  | 'REQUESTER';

export type ParticipantTargetType =
  | 'USER'
  | 'ROLE'
  | 'STATION'
  | 'RESPONSIBILITY';

export interface Participant {
  targetType: ParticipantTargetType;
  targetId: string;
  participantRole: ParticipantRole;
  ackRequired: boolean;
  ackedAt?: string;
  ackedByUserId?: string;
}

export type ShiftResponsibility = 'SHIFT_LEAD' | 'CASH_LEAD' | 'CLOSING_LEAD';

export interface ShiftAssignment {
  userId: string;
  roleCode: string;
  stationId?: string;
  responsibilities: ShiftResponsibility[];
  joinedAt: string;
  leftAt?: string;
}

export type CoordinationOutcome =
  | 'RESOLVED'
  | 'REJECTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'NO_EFFECT';

export interface CoordinationResult {
  outcome: CoordinationOutcome;
  summary?: string;
  evidenceRefs?: string[];
  measuredImpact?: {
    metric: string;
    valueBefore?: number;
    valueAfter?: number;
    unit?: string;
  };
  closedAt: string;
  closedByUserId: string;
}

export type HandoffSectionKind =
  | 'CASH_STATUS'
  | 'OPEN_COORDINATIONS'
  | 'CRITICAL_STOCK'
  | 'EQUIPMENT_ISSUES'
  | 'NOTES'
  | 'RECURRING_PENDINGS';

export interface HandoffSection {
  kind: HandoffSectionKind;
  title: string;
  payload: Record<string, unknown>;
  requiredAck: boolean;
}

export const ACTIVE_COORDINATION_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'ESCALATED',
] as const;

export const DEFAULT_ACK_DEADLINE_MINUTES = 5;
export const READY_TIMEOUT_MINUTES = 8;
export const LINE_PUSH_BUDGET = 3;
