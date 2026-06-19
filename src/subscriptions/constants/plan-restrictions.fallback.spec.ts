import { PlanType } from '../dto';
import {
  buildFallbackSnapshot,
  fallbackGetMinimumPlanForFeature,
  fallbackHasFeature,
} from './plan-restrictions.fallback';

describe('Plan restrictions fallback', () => {
  it('aplica límites de productos por plan según seed', () => {
    expect(buildFallbackSnapshot(PlanType.STARTER).limits.products).toBe(10);
    expect(buildFallbackSnapshot(PlanType.PROFESSIONAL).limits.products).toBe(
      200,
    );
    expect(
      buildFallbackSnapshot(PlanType.ENTERPRISE).limits.products,
    ).toBeLessThan(0);
  });

  it('habilita delivery en Operación y no en Directo', () => {
    expect(fallbackHasFeature(PlanType.STARTER, 'delivery')).toBe(false);
    expect(fallbackHasFeature(PlanType.PROFESSIONAL, 'delivery')).toBe(true);
    expect(fallbackHasFeature(PlanType.ENTERPRISE, 'delivery')).toBe(true);
  });

  it('requiere Operación para loyalty y Full para multi-sucursal', () => {
    expect(fallbackGetMinimumPlanForFeature('loyalty')).toBe(
      PlanType.PROFESSIONAL,
    );
    expect(fallbackGetMinimumPlanForFeature('multi_branch')).toBe(
      PlanType.ENTERPRISE,
    );
  });

  it('mapea claves legacy de guards a restricciones canónicas', () => {
    expect(fallbackHasFeature(PlanType.PROFESSIONAL, 'kitchen_display')).toBe(
      true,
    );
    expect(fallbackHasFeature(PlanType.STARTER, 'reviews')).toBe(false);
    expect(fallbackHasFeature(PlanType.PROFESSIONAL, 'reviews')).toBe(true);
  });
});
