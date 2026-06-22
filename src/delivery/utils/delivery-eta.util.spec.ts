import { computeLiveDeliveryEta } from './delivery-eta.util';

describe('delivery-eta.util', () => {
  it('returns live eta when driver is en route with fresh gps', () => {
    const eta = computeLiveDeliveryEta({
      status: 'IN_TRANSIT',
      driverLat: -34.6037,
      driverLng: -58.3816,
      destinationLat: -34.611,
      destinationLng: -58.396,
      vehicle: 'Moto',
      locationUpdatedAt: new Date().toISOString(),
    });

    expect(eta.liveEtaMinutes).toBeGreaterThan(0);
    expect(eta.distanceKmRemaining).toBeGreaterThan(0);
  });

  it('skips eta before pickup or without coordinates', () => {
    expect(
      computeLiveDeliveryEta({
        status: 'ASSIGNED',
        driverLat: -34.6037,
        driverLng: -58.3816,
        destinationLat: -34.611,
        destinationLng: -58.396,
      }).liveEtaMinutes,
    ).toBeNull();

    expect(
      computeLiveDeliveryEta({
        status: 'IN_TRANSIT',
        driverLat: null,
        driverLng: null,
        destinationLat: -34.611,
        destinationLng: -58.396,
      }).liveEtaMinutes,
    ).toBeNull();
  });
});
