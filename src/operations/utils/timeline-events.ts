import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';

export type TimelineEntryKind =
  | 'ritual'
  | 'coordination'
  | 'execution'
  | 'intelligence';

export const TIMELINE_RITUAL_EVENTS: readonly BentooBusinessEventType[] = [
  BentooBusinessEventType.ShiftOpened,
  BentooBusinessEventType.ShiftClosingStarted,
  BentooBusinessEventType.ShiftClosed,
  BentooBusinessEventType.ShiftLeadAssigned,
  BentooBusinessEventType.ShiftRosterChanged,
  BentooBusinessEventType.HandoffPublished,
  BentooBusinessEventType.HandoffAccepted,
  BentooBusinessEventType.RestaurantOpened,
] as const;

export const TIMELINE_COORDINATION_EVENTS: readonly BentooBusinessEventType[] =
  [
    BentooBusinessEventType.CoordinationOpened,
    BentooBusinessEventType.CoordinationAcknowledged,
    BentooBusinessEventType.CoordinationCompleted,
    BentooBusinessEventType.CoordinationEscalated,
    BentooBusinessEventType.CoordinationDeclined,
    BentooBusinessEventType.HelpRequested,
    BentooBusinessEventType.ApprovalRequested,
    BentooBusinessEventType.ApprovalResolved,
  ] as const;

export const TIMELINE_EXECUTION_EVENTS: readonly BentooBusinessEventType[] = [
  BentooBusinessEventType.OrderCreated,
  BentooBusinessEventType.ProductOutOfStock,
  BentooBusinessEventType.ReservationCreated,
  BentooBusinessEventType.OrderReadyStale,
  BentooBusinessEventType.InventoryLowStock,
] as const;

export const TIMELINE_INTELLIGENCE_EVENTS: readonly BentooBusinessEventType[] =
  [BentooBusinessEventType.IntelligenceMovePrepared] as const;

export const TIMELINE_QUERY_EVENTS: readonly BentooBusinessEventType[] = [
  ...TIMELINE_RITUAL_EVENTS,
  ...TIMELINE_COORDINATION_EVENTS,
  ...TIMELINE_EXECUTION_EVENTS,
  ...TIMELINE_INTELLIGENCE_EVENTS,
];

export function timelineKindForEvent(
  eventType: BentooBusinessEventType,
): TimelineEntryKind {
  if ((TIMELINE_RITUAL_EVENTS as readonly string[]).includes(eventType)) {
    return 'ritual';
  }
  if ((TIMELINE_COORDINATION_EVENTS as readonly string[]).includes(eventType)) {
    return 'coordination';
  }
  if ((TIMELINE_INTELLIGENCE_EVENTS as readonly string[]).includes(eventType)) {
    return 'intelligence';
  }
  return 'execution';
}
