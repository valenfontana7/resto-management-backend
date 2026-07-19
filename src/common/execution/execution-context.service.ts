import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type LabExecutionOrigin = 'SIMULATED' | 'MANUAL' | 'HEADLESS';

export interface BentooExecutionContext {
  runId: string;
  participantKey: string;
  origin: LabExecutionOrigin;
  correlationId: string;
  simulatedNow: Date;
}

@Injectable()
export class ExecutionContextService {
  private readonly storage = new AsyncLocalStorage<BentooExecutionContext>();

  run<TResult>(
    context: BentooExecutionContext,
    callback: () => TResult,
  ): TResult {
    return this.storage.run(context, callback);
  }

  get(): BentooExecutionContext | undefined {
    return this.storage.getStore();
  }

  require(): BentooExecutionContext {
    const context = this.get();
    if (!context) {
      throw new Error('No hay un contexto de ejecución Bentoo activo');
    }
    return context;
  }
}
