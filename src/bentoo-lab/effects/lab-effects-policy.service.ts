import { Inject, Injectable, Optional } from '@nestjs/common';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import {
  EXTERNAL_BOUNDARIES,
  ExternalBoundaryId,
  REQUIRED_LAB_BOUNDARIES,
} from './external-boundary.registry';

export const LAB_EFFECTS_ENV = 'BENTOO_LAB_EFFECTS_ENV';

export type ExternalEffectResult = 'ALLOWED' | 'BLOCKED' | 'EXECUTED';

export interface ExternalEffectAttempt {
  boundary: ExternalBoundaryId;
  result: ExternalEffectResult;
  runId?: string;
  detail?: string;
  realAt: string;
}

@Injectable()
export class LabEffectsPolicyService {
  private readonly attempts: ExternalEffectAttempt[] = [];
  private readonly env: Record<string, string | undefined>;

  constructor(
    @Optional()
    @Inject(LAB_EFFECTS_ENV)
    env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  assertStartupPolicyComplete(): void {
    const registered = new Set(EXTERNAL_BOUNDARIES.map((entry) => entry.id));
    const missing = REQUIRED_LAB_BOUNDARIES.filter(
      (boundary) => !registered.has(boundary),
    );
    if (missing.length > 0) {
      throw new Error(
        `Bentoo Lab no tiene política para: ${missing.join(', ')}`,
      );
    }
  }

  authorize(
    boundary: ExternalBoundaryId,
    context: { runId?: string; detail?: string } = {},
  ): { allowed: boolean; result: 'ALLOWED' | 'BLOCKED' } {
    const definition = EXTERNAL_BOUNDARIES.find(
      (entry) => entry.id === boundary,
    );

    if (!definition) {
      if (isLabRuntime(this.env)) {
        throw new Error(
          `Frontera externa no registrada en Bentoo Lab: ${String(boundary)}`,
        );
      }
      return { allowed: true, result: 'ALLOWED' };
    }

    const result = isLabRuntime(this.env) ? 'BLOCKED' : 'ALLOWED';
    this.attempts.push({
      boundary,
      result,
      runId: context.runId,
      detail: context.detail,
      realAt: new Date().toISOString(),
    });

    return { allowed: result === 'ALLOWED', result };
  }

  markExecuted(
    boundary: ExternalBoundaryId,
    context: { runId?: string; detail?: string } = {},
  ): void {
    if (isLabRuntime(this.env)) {
      throw new Error(
        `Bentoo Lab bloqueó la ejecución de la frontera ${boundary}`,
      );
    }
    this.attempts.push({
      boundary,
      result: 'EXECUTED',
      runId: context.runId,
      detail: context.detail,
      realAt: new Date().toISOString(),
    });
  }

  getAttempts(): readonly ExternalEffectAttempt[] {
    return [...this.attempts];
  }
}
