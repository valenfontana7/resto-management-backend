import {
  DEFAULT_OPERATION_ESCALATION,
  getOperationEscalation,
  mergeOperationEscalation,
  normalizeEscalationInput,
  resolveAckDeadlineMinutes,
} from './operation-escalation';

describe('operation-escalation', () => {
  it('returns defaults when businessRules has no escalation config', () => {
    const config = getOperationEscalation(null);
    expect(config).toEqual(DEFAULT_OPERATION_ESCALATION);
  });

  it('merges custom priority minutes from businessRules', () => {
    const config = getOperationEscalation({
      operations: {
        escalation: {
          ackDeadlineMinutesByPriority: { HIGH: 8 },
          escalateCriticalImmediately: false,
        },
      },
    });

    expect(config.ackDeadlineMinutesByPriority.HIGH).toBe(8);
    expect(config.ackDeadlineMinutesByPriority.NORMAL).toBe(10);
    expect(config.escalateCriticalImmediately).toBe(false);
  });

  it('resolveAckDeadlineMinutes uses explicit override', () => {
    expect(resolveAckDeadlineMinutes(null, 'NORMAL', 3)).toBe(3);
  });

  it('resolveAckDeadlineMinutes caps CRITICAL at 1 when immediate escalation enabled', () => {
    expect(resolveAckDeadlineMinutes(null, 'CRITICAL')).toBe(1);
  });

  it('normalizeEscalationInput rejects invalid minutes via fallback', () => {
    const config = normalizeEscalationInput({
      ackDeadlineMinutesByPriority: { LOW: 999, HIGH: 0 },
    });
    expect(config.ackDeadlineMinutesByPriority.LOW).toBe(15);
    expect(config.ackDeadlineMinutesByPriority.HIGH).toBe(5);
  });

  it('mergeOperationEscalation preserves other businessRules keys', () => {
    const merged = mergeOperationEscalation(
      { payment: { foo: 'bar' } },
      DEFAULT_OPERATION_ESCALATION,
    );
    expect(merged).toMatchObject({
      payment: { foo: 'bar' },
      operations: { escalation: DEFAULT_OPERATION_ESCALATION },
    });
  });
});
