import { ImportStepLog } from './types';

export type ImportLogLevel = 'info' | 'warn' | 'error';

export interface ImportLogEvent {
  timestamp: string;
  level: ImportLogLevel;
  step: string;
  message: string;
  data?: Record<string, unknown>;
}

export type ImportLogSink = (event: ImportLogEvent) => void;

/**
 * Logger estructurado del pipeline. Cada paso emite eventos y mide duración;
 * el sink decide el destino (stdout JSON, consola humana del CLI, buffer en tests).
 */
export class ImportLogger {
  private readonly events: ImportLogEvent[] = [];
  private readonly steps: ImportStepLog[] = [];

  constructor(private readonly sink?: ImportLogSink) {}

  log(
    level: ImportLogLevel,
    step: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const event: ImportLogEvent = {
      timestamp: new Date().toISOString(),
      level,
      step,
      message,
      ...(data ? { data } : {}),
    };
    this.events.push(event);
    this.sink?.(event);
  }

  info(step: string, message: string, data?: Record<string, unknown>) {
    this.log('info', step, message, data);
  }

  warn(step: string, message: string, data?: Record<string, unknown>) {
    this.log('warn', step, message, data);
  }

  error(step: string, message: string, data?: Record<string, unknown>) {
    this.log('error', step, message, data);
  }

  /** Ejecuta un paso midiendo duración y emitiendo started/finished. */
  async step<T>(step: string, fn: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now();
    this.info(step, `${step} started`);
    try {
      const result = await fn();
      const durationMs = Date.now() - startedAt;
      this.steps.push({ step, durationMs });
      this.info(step, `${step} finished`, { durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.steps.push({ step, durationMs });
      this.error(step, `${step} failed: ${(error as Error).message}`, {
        durationMs,
      });
      throw error;
    }
  }

  getEvents(): ImportLogEvent[] {
    return [...this.events];
  }

  getSteps(): ImportStepLog[] {
    return [...this.steps];
  }
}
