import {
  aggregateHourlyBuckets,
  buildRiskWindows,
  suggestStaffCount,
} from './shift-forecast.utils';

describe('shift-forecast.utils', () => {
  it('suggests staff from expected orders', () => {
    expect(suggestStaffCount(0)).toBe(2);
    expect(suggestStaffCount(30)).toBe(5);
    expect(suggestStaffCount(200)).toBe(8);
  });

  it('aggregates hourly buckets inside segment', () => {
    const buckets = aggregateHourlyBuckets(
      [
        { createdAt: new Date('2026-07-04T20:30:00') },
        { createdAt: new Date('2026-07-04T21:15:00') },
        { createdAt: new Date('2026-07-04T09:00:00') },
      ],
      { startHour: 20, endHour: 24 },
    );
    expect(buckets).toEqual([
      { hour: 20, count: 1 },
      { hour: 21, count: 1 },
    ]);
  });

  it('flags risk windows above average', () => {
    const risks = buildRiskWindows(
      [
        { hour: 20, count: 10 },
        { hour: 21, count: 20 },
      ],
      10,
    );
    expect(risks.some((row) => row.hour === 21)).toBe(true);
  });
});
