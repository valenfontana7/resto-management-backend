import { PlanType } from '@prisma/client';

import {
  adjustFeaturesForPlan,
  DEFAULT_FEATURES_BY_PLAN,
} from './plans.constants';

describe('DEFAULT_FEATURES_BY_PLAN', () => {
  it('allows salon and tables on STARTER when the plan has a tables quota', () => {
    expect(DEFAULT_FEATURES_BY_PLAN[PlanType.STARTER].salon).toBe(true);
    expect(DEFAULT_FEATURES_BY_PLAN[PlanType.STARTER].tables).toBe(true);
    expect(DEFAULT_FEATURES_BY_PLAN[PlanType.STARTER].reservations).toBe(false);
    expect(DEFAULT_FEATURES_BY_PLAN[PlanType.STARTER].onlineOrdering).toBe(
      false,
    );
  });

  it('does not strip salon/tables when adjusting STARTER features', () => {
    const adjusted = adjustFeaturesForPlan(
      { salon: true, tables: true, onlineOrdering: false },
      PlanType.STARTER,
    );

    expect(adjusted.salon).toBe(true);
    expect(adjusted.tables).toBe(true);
  });
});
