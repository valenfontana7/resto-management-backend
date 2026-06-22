import { describe, expect, it } from '@jest/globals';
import {
  buildTopFrictions,
  computePeriodDelta,
} from './activation-dashboard.utils';

describe('activation-dashboard.utils', () => {
  it('calcula delta porcentual entre periodos', () => {
    expect(computePeriodDelta(12, 8)).toBe(50);
    expect(computePeriodDelta(0, 0)).toBeNull();
  });

  it('prioriza fricciones del funnel y stuck states', () => {
    const frictions = buildTopFrictions({
      funnelDrops: [
        {
          event: 'preview_published',
          label: 'Web publicada',
          dropPercent: 45,
          lostSessions: 12,
        },
      ],
      unpublishedAfter3Days: 6,
      noMenuAfter7Days: 2,
      noFirstChargeAfter14Days: 4,
      limit: 3,
    });

    expect(frictions).toHaveLength(3);
    expect(frictions.some((f) => f.id === 'funnel-preview_published')).toBe(
      true,
    );
    expect(frictions.some((f) => f.id === 'stuck-unpublished')).toBe(true);
  });
});
