export interface OperationEscalationConfig {
  ackDeadlineMinutesByPriority: Record<
    'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW',
    number
  >;
  /** CRITICAL usa plazo mínimo (1 min) para escalar al lead más rápido. */
  escalateCriticalImmediately: boolean;
}

export const DEFAULT_OPERATION_ESCALATION: OperationEscalationConfig = {
  ackDeadlineMinutesByPriority: {
    CRITICAL: 2,
    HIGH: 5,
    NORMAL: 10,
    LOW: 15,
  },
  escalateCriticalImmediately: true,
};

const PRIORITY_KEYS = new Set(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']);

function clampMinutes(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 120) return fallback;
  return Math.round(n);
}

export function getOperationEscalation(
  businessRules: unknown,
): OperationEscalationConfig {
  const rules =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : null;
  const operations =
    rules?.operations && typeof rules.operations === 'object'
      ? (rules.operations as Record<string, unknown>)
      : null;
  const raw =
    operations?.escalation && typeof operations.escalation === 'object'
      ? (operations.escalation as Record<string, unknown>)
      : null;

  if (!raw) {
    return {
      ackDeadlineMinutesByPriority: {
        ...DEFAULT_OPERATION_ESCALATION.ackDeadlineMinutesByPriority,
      },
      escalateCriticalImmediately:
        DEFAULT_OPERATION_ESCALATION.escalateCriticalImmediately,
    };
  }

  const byPriorityRaw =
    raw.ackDeadlineMinutesByPriority &&
    typeof raw.ackDeadlineMinutesByPriority === 'object'
      ? (raw.ackDeadlineMinutesByPriority as Record<string, unknown>)
      : {};

  const ackDeadlineMinutesByPriority = {
    ...DEFAULT_OPERATION_ESCALATION.ackDeadlineMinutesByPriority,
  };

  for (const key of PRIORITY_KEYS) {
    if (key in byPriorityRaw) {
      ackDeadlineMinutesByPriority[key] = clampMinutes(
        byPriorityRaw[key],
        DEFAULT_OPERATION_ESCALATION.ackDeadlineMinutesByPriority[key],
      );
    }
  }

  return {
    ackDeadlineMinutesByPriority,
    escalateCriticalImmediately: raw.escalateCriticalImmediately !== false,
  };
}

export function mergeOperationEscalation(
  businessRules: unknown,
  config: OperationEscalationConfig,
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
      escalation: config,
    },
  };
}

export function normalizeEscalationInput(input: {
  ackDeadlineMinutesByPriority?: Partial<
    Record<'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', number>
  >;
  escalateCriticalImmediately?: boolean;
}): OperationEscalationConfig {
  const current = DEFAULT_OPERATION_ESCALATION;
  const byPriority = { ...current.ackDeadlineMinutesByPriority };

  if (input.ackDeadlineMinutesByPriority) {
    for (const key of PRIORITY_KEYS) {
      if (input.ackDeadlineMinutesByPriority[key] != null) {
        byPriority[key] = clampMinutes(
          input.ackDeadlineMinutesByPriority[key],
          byPriority[key],
        );
      }
    }
  }

  return {
    ackDeadlineMinutesByPriority: byPriority,
    escalateCriticalImmediately:
      input.escalateCriticalImmediately !== undefined
        ? input.escalateCriticalImmediately !== false
        : current.escalateCriticalImmediately,
  };
}

export function resolveAckDeadlineMinutes(
  businessRules: unknown,
  priority: string,
  explicit?: number,
): number {
  if (explicit != null && explicit > 0) {
    return clampMinutes(explicit, 5);
  }

  const config = getOperationEscalation(businessRules);
  const key =
    typeof priority === 'string' && PRIORITY_KEYS.has(priority)
      ? (priority as keyof OperationEscalationConfig['ackDeadlineMinutesByPriority'])
      : 'NORMAL';

  let minutes = config.ackDeadlineMinutesByPriority[key] ?? 10;

  if (config.escalateCriticalImmediately && key === 'CRITICAL') {
    minutes = Math.min(minutes, 1);
  }

  return minutes;
}

export const DEFAULT_ACK_DEADLINE_MINUTES =
  DEFAULT_OPERATION_ESCALATION.ackDeadlineMinutesByPriority.HIGH;
