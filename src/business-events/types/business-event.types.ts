import type {
  BusinessEventImportance,
  BusinessEventReplayPolicy,
} from '@prisma/client';
import type { BentooBusinessEventType } from './event-type.enum';
import type { BentooBusinessEventPayloadMap } from './payloads';

export interface BentooBusinessEvent<
  T extends BentooBusinessEventType = BentooBusinessEventType,
> {
  id: string;
  eventType: T;
  restaurantId: string;
  source: string;
  importance: BusinessEventImportance;
  replayPolicy: BusinessEventReplayPolicy;
  payload: BentooBusinessEventPayloadMap[T];
  occurredAt: Date;
  correlationId?: string | null;
  /** True when re-dispatched from historical store */
  isReplay?: boolean;
}

export interface PublishBusinessEventInput<
  T extends BentooBusinessEventType = BentooBusinessEventType,
> {
  eventType: T;
  restaurantId: string;
  payload: BentooBusinessEventPayloadMap[T];
  source?: string;
  occurredAt?: Date;
  correlationId?: string;
}

export interface BusinessEventSubscriber {
  readonly id: string;
  /** Empty = all events; otherwise only matching types */
  readonly eventTypes?: readonly BentooBusinessEventType[];
  handle(event: BentooBusinessEvent): void | Promise<void>;
}

export interface BusinessEventDispatchMeta {
  isReplay: boolean;
  subscriberId: string;
}
