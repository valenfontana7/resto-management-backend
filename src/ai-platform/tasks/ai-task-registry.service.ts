import { Injectable, Logger } from '@nestjs/common';
import type { AiTaskHandler } from '../types/ai-task.types';

@Injectable()
export class AiTaskRegistry {
  private readonly logger = new Logger(AiTaskRegistry.name);
  private readonly handlers = new Map<string, AiTaskHandler>();

  register(handler: AiTaskHandler): void {
    if (this.handlers.has(handler.key)) {
      this.logger.warn(`Overwriting AI task handler: ${handler.key}`);
    }
    this.handlers.set(handler.key, handler);
    this.logger.log(`Registered AI task: ${handler.key} (${handler.category})`);
  }

  registerMany(handlers: AiTaskHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  get(key: string): AiTaskHandler | undefined {
    return this.handlers.get(key);
  }

  getOrThrow(key: string): AiTaskHandler {
    const handler = this.handlers.get(key);
    if (!handler) {
      throw new Error(`AI task handler not registered: ${key}`);
    }
    return handler;
  }

  list(): Array<{
    key: string;
    category: string;
    requiresApproval: boolean;
  }> {
    return [...this.handlers.values()].map((h) => ({
      key: h.key,
      category: h.category,
      requiresApproval: h.requiresApproval,
    }));
  }
}
