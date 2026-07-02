export const DOMAIN_EVENT_TYPES = {
  TaskCompleted: 'TaskCompleted',
  TaskFailed: 'TaskFailed',
  PlanApproved: 'PlanApproved',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export interface DomainEventPayload {
  taskId: string;
  taskKey: string;
  planId?: string | null;
  planStepId?: string | null;
  goalId?: string | null;
  leadId?: string | null;
  status: string;
  output?: unknown;
}

export interface DomainEventHandlerRegistration {
  handlerKey: string;
  eventType: DomainEventType;
  priority: number;
  handle: (payload: DomainEventPayload, outboxId: string) => Promise<void>;
}
