import {
  daysBetween,
  isSameUtcDay,
  isSameUtcWeek,
  computeDefaultExpiresAt,
} from './business-memory.utils';
import { BusinessMemoryCategory } from '@prisma/client';

describe('business-memory.utils', () => {
  it('calcula días entre fechas en UTC', () => {
    const start = new Date('2026-06-20T15:00:00.000Z');
    const end = new Date('2026-06-25T09:00:00.000Z');
    expect(daysBetween(start, end)).toBe(5);
  });

  it('detecta misma semana UTC', () => {
    expect(
      isSameUtcWeek(
        new Date('2026-06-26T10:00:00.000Z'),
        new Date('2026-06-28T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('detecta mismo día UTC', () => {
    expect(
      isSameUtcDay(
        new Date('2026-06-28T02:00:00.000Z'),
        new Date('2026-06-28T20:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isSameUtcDay(
        new Date('2026-06-28T23:00:00.000Z'),
        new Date('2026-06-29T01:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('asigna TTL por categoría', () => {
    const expires = computeDefaultExpiresAt(
      BusinessMemoryCategory.OPERATIONAL,
      new Date('2026-06-01T00:00:00.000Z'),
    );
    expect(expires.toISOString().slice(0, 10)).toBe('2026-06-15');
  });
});
