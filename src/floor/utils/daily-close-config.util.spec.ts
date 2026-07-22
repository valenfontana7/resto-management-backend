import { resolveDailyCloseConfig } from './daily-close-config.util';
import { DEFAULT_DAILY_CLOSE_CONFIG } from '../types/daily-close-report.types';

describe('resolveDailyCloseConfig', () => {
  it('usa defaults con blockers duros de pedidos', () => {
    expect(resolveDailyCloseConfig(null)).toEqual(DEFAULT_DAILY_CLOSE_CONFIG);
    expect(DEFAULT_DAILY_CLOSE_CONFIG.requireNoUnpaidOrders).toBe(true);
    expect(DEFAULT_DAILY_CLOSE_CONFIG.requireNoOpenKitchenOrders).toBe(true);
  });

  it('permite override desde businessRules.floor.dailyClose', () => {
    expect(
      resolveDailyCloseConfig({
        floor: {
          dailyClose: {
            requireNoUnpaidOrders: false,
            requireNoOpenKitchenOrders: false,
          },
        },
      }),
    ).toMatchObject({
      requireNoUnpaidOrders: false,
      requireNoOpenKitchenOrders: false,
    });
  });
});
