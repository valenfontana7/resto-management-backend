import { CoordinationPriority } from '@prisma/client';
import {
  appendPrecedentDescription,
  applyPrioritySuppression,
  buildResolutionMemoryKey,
  computeSuccessRate,
  formatPrecedentLine,
  isIgnoredOutcome,
  shouldPromotePattern,
} from './resolution-memory';

describe('resolution-memory', () => {
  it('builds stable memory keys', () => {
    expect(buildResolutionMemoryKey('Kitchen Congestion', 'EVENING')).toBe(
      'resolution:kitchen-congestion:evening',
    );
  });

  it('detects ignored outcomes', () => {
    expect(isIgnoredOutcome('NO_EFFECT')).toBe(true);
    expect(isIgnoredOutcome('RESOLVED', 'Ignorar por ahora')).toBe(true);
    expect(isIgnoredOutcome('RESOLVED', 'Resuelto')).toBe(false);
  });

  it('promotes after 2 occurrences or measured impact', () => {
    expect(
      shouldPromotePattern({ occurrenceCount: 1, hasMeasuredImpact: false }),
    ).toBe(false);
    expect(
      shouldPromotePattern({ occurrenceCount: 2, hasMeasuredImpact: false }),
    ).toBe(true);
    expect(
      shouldPromotePattern({ occurrenceCount: 1, hasMeasuredImpact: true }),
    ).toBe(true);
  });

  it('lowers priority after suppression threshold', () => {
    expect(applyPrioritySuppression(CoordinationPriority.CRITICAL, 2)).toBe(
      CoordinationPriority.CRITICAL,
    );
    expect(applyPrioritySuppression(CoordinationPriority.CRITICAL, 3)).toBe(
      CoordinationPriority.HIGH,
    );
  });

  it('formats precedent copy', () => {
    const line = formatPrecedentLine({
      memoryKey: 'resolution:kitchen-congestion',
      title: 'Congestión cocina',
      summary: 'Pausar delivery 30 min redujo tiempos',
      occurrenceCount: 4,
      successRate: 0.75,
      ignoreCount: 0,
      medianImpact: {
        metric: 'avg_prep_time',
        valueBefore: 42,
        valueAfter: 34,
        unit: 'min',
      },
    });
    expect(line).toContain('Precedente:');
    expect(line).toContain('42→34 min');
  });

  it('appends precedent without duplicating', () => {
    const text = appendPrecedentDescription('Acción sugerida', {
      memoryKey: 'resolution:test',
      title: 'Test',
      summary: 'Resolvió bien',
      occurrenceCount: 3,
      successRate: 1,
      ignoreCount: 0,
    });
    expect(text).toContain('Acción sugerida');
    expect(text).toContain('Precedente:');
  });

  it('computes success rate', () => {
    expect(computeSuccessRate(3, 4)).toBe(0.75);
  });
});
