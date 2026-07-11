import { Injectable } from '@nestjs/common';
import type {
  OperationalEventHandler,
  OperationalEventType,
} from './operational-event.types';

@Injectable()
export class OperationalEventHandlerRegistry {
  private readonly handlers: OperationalEventHandler[] = [];

  register(handler: OperationalEventHandler): void {
    this.handlers.push(handler);
  }

  getHandlers(eventType: OperationalEventType): OperationalEventHandler[] {
    return this.handlers.filter((handler) => handler.supports(eventType));
  }
}
