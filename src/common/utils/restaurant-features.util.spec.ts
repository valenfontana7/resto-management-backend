import { normalizeRestaurantFeatures } from './restaurant-features.util';

describe('normalizeRestaurantFeatures', () => {
  it('derives salon from orders when missing (legacy)', () => {
    expect(normalizeRestaurantFeatures({ orders: true }).salon).toBe(true);
    expect(normalizeRestaurantFeatures({ orders: false }).salon).toBe(false);
  });

  it('derives tables from reservations or salon when missing (legacy)', () => {
    expect(
      normalizeRestaurantFeatures({ reservations: true, salon: false }).tables,
    ).toBe(true);
    expect(
      normalizeRestaurantFeatures({ reservations: false, salon: true }).tables,
    ).toBe(true);
    expect(
      normalizeRestaurantFeatures({ reservations: false, salon: false }).tables,
    ).toBe(false);
  });

  it('cascades orders off to salon and online channels', () => {
    const features = normalizeRestaurantFeatures({
      orders: false,
      onlineOrdering: true,
      delivery: true,
      takeaway: true,
      salon: true,
    });

    expect(features.salon).toBe(false);
    expect(features.onlineOrdering).toBe(false);
    expect(features.delivery).toBe(false);
    expect(features.takeaway).toBe(false);
  });

  it('disables tables when salon and reservations are off', () => {
    const features = normalizeRestaurantFeatures({
      salon: false,
      reservations: false,
      tables: true,
    });

    expect(features.tables).toBe(false);
  });
});
