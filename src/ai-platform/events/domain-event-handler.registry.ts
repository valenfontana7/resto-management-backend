import { Injectable, Logger } from '@nestjs/common';
import type {
  DomainEventHandlerRegistration,
  DomainEventType,
} from './domain-event.types';

@Injectable()
export class DomainEventHandlerRegistry {
  private readonly logger = new Logger(DomainEventHandlerRegistry.name);
  private readonly handlers = new Map<
    DomainEventType,
    DomainEventHandlerRegistration[]
  >();

  register(registration: DomainEventHandlerRegistration): void {
    const list = this.handlers.get(registration.eventType) ?? [];
    list.push(registration);
    list.sort((a, b) => a.priority - b.priority);
    this.handlers.set(registration.eventType, list);
    this.logger.log(
      `Handler registered: ${registration.handlerKey} → ${registration.eventType} (priority ${registration.priority})`,
    );
  }

  getHandlers(eventType: DomainEventType): DomainEventHandlerRegistration[] {
    return this.handlers.get(eventType) ?? [];
  }
}
