import type { CoordinationPriority, CoordinationType } from '@prisma/client';

export type RoutineTrigger = 'SHIFT_OPENED' | 'SHIFT_CLOSING_STARTED';

export interface OperationalRoutineDefinition {
  id: string;
  enabled: boolean;
  /** 3 = ejecutar y reportar (sin aprobación en servicio). */
  autonomyLevel: 2 | 3;
  trigger: RoutineTrigger;
  type: CoordinationType;
  priority: CoordinationPriority;
  title: string;
  description?: string;
  target: {
    targetType: 'RESPONSIBILITY' | 'ROLE' | 'STATION';
    targetId: string;
  };
}

export interface OperationRoutinesConfig {
  routines: OperationalRoutineDefinition[];
}

export const DEFAULT_OPERATION_ROUTINES: OperationRoutinesConfig = {
  routines: [
    {
      id: 'opening-pattern-scan',
      enabled: false,
      autonomyLevel: 3,
      trigger: 'SHIFT_OPENED',
      type: 'TASK',
      priority: 'NORMAL',
      title: 'Revisar patrones del turno',
      description: 'Mirá los precedentes activos antes del rush.',
      target: { targetType: 'RESPONSIBILITY', targetId: 'SHIFT_LEAD' },
    },
  ],
};

export function getOperationRoutines(
  businessRules: unknown,
): OperationRoutinesConfig {
  const rules =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : null;
  const operations =
    rules?.operations && typeof rules.operations === 'object'
      ? (rules.operations as Record<string, unknown>)
      : null;
  const raw =
    operations?.routines && typeof operations.routines === 'object'
      ? (operations.routines as OperationRoutinesConfig)
      : null;

  if (!raw?.routines?.length) {
    return {
      routines: DEFAULT_OPERATION_ROUTINES.routines.map((routine) => ({
        ...routine,
      })),
    };
  }

  return {
    routines: raw.routines.map((routine) => ({ ...routine })),
  };
}

export function mergeOperationRoutines(
  businessRules: unknown,
  config: OperationRoutinesConfig,
): Record<string, unknown> {
  const base =
    businessRules && typeof businessRules === 'object'
      ? { ...(businessRules as Record<string, unknown>) }
      : {};
  const prevOps =
    base.operations && typeof base.operations === 'object'
      ? { ...(base.operations as Record<string, unknown>) }
      : {};
  return {
    ...base,
    operations: {
      ...prevOps,
      routines: config,
    },
  };
}
