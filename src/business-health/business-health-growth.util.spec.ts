import { describe, expect, it } from '@jest/globals';
import {
  getGrowthSettings,
  mergeGrowthSettings,
} from './business-health-growth.util';

describe('business-health-growth.util', () => {
  it('lee autoWinBackEnabled desactivado por defecto', () => {
    expect(getGrowthSettings(null).autoWinBackEnabled).toBe(false);
    expect(getGrowthSettings({}).autoWinBackMaxPerWeek).toBe(5);
  });

  it('respeta configuración de growth en businessRules', () => {
    const settings = getGrowthSettings({
      growth: { autoWinBackEnabled: true, autoWinBackMaxPerWeek: 8 },
    });
    expect(settings.autoWinBackEnabled).toBe(true);
    expect(settings.autoWinBackMaxPerWeek).toBe(8);
  });

  it('limita autoWinBackMaxPerWeek entre 1 y 20', () => {
    expect(
      getGrowthSettings({ growth: { autoWinBackMaxPerWeek: 99 } })
        .autoWinBackMaxPerWeek,
    ).toBe(20);
  });

  it('mergeGrowthSettings preserva otras reglas', () => {
    const merged = mergeGrowthSettings(
      { payment: { methods: ['cash'] }, growth: { autoWinBackMaxPerWeek: 3 } },
      { autoWinBackEnabled: true },
    );
    expect(merged.payment).toEqual({ methods: ['cash'] });
    expect(merged.growth).toEqual({
      autoWinBackMaxPerWeek: 3,
      autoWinBackEnabled: true,
    });
  });
});
