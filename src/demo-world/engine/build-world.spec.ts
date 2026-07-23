import { buildDemoWorld } from './build-world';
import { listFlagshipProfiles } from '../profiles';

describe('buildDemoWorld', () => {
  it('makes profile hits dominate analytics for every flagship', () => {
    for (const profile of listFlagshipProfiles()) {
      const world = buildDemoWorld(profile);
      const top = world.analytics.topDishes[0]?.dishName;
      expect(top).toBeDefined();
      expect(profile.hits).toContain(top);
      expect(world.orders.length).toBeGreaterThan(100);
      expect(world.customers.some((c) => c.segment === 'vip')).toBe(true);
      expect(world.customers.some((c) => c.segment === 'churn_return')).toBe(
        true,
      );
      expect(world.reviews.some((r) => r.rating <= 3)).toBe(true);
      expect(
        world.inventory.some((i) => i.quantity < i.lowStockThreshold),
      ).toBe(true);
      expect(world.promos.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic for the same profile seed', () => {
    const profile = listFlagshipProfiles()[0];
    const a = buildDemoWorld(profile);
    const b = buildDemoWorld(profile);
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.analytics.topDishes[0]?.dishName).toBe(
      b.analytics.topDishes[0]?.dishName,
    );
    expect(a.orders[0]?.id).toBe(b.orders[0]?.id);
  });
});
