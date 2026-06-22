import {
  estimateTravelMinutes,
  haversineDistanceKm,
  resolveVehicleSpeedKmh,
} from './geo-distance.util';

describe('geo-distance.util', () => {
  it('computes haversine distance between nearby points', () => {
    const distance = haversineDistanceKm(
      { lat: -34.6037, lng: -58.3816 },
      { lat: -34.611, lng: -58.396 },
    );

    expect(distance).toBeGreaterThan(1);
    expect(distance).toBeLessThan(3);
  });

  it('resolves vehicle speed from label', () => {
    expect(resolveVehicleSpeedKmh('Moto')).toBe(28);
    expect(resolveVehicleSpeedKmh('Bicicleta')).toBe(14);
    expect(resolveVehicleSpeedKmh('Auto')).toBe(22);
  });

  it('estimates travel minutes from distance', () => {
    expect(estimateTravelMinutes(2.2, 22)).toBe(6);
  });
});
