import {
  estimatePolygonAreaSqKm,
  isPointInPolygonRing,
  isPointInZoneRings,
  normalizeManualPolygonRings,
  parseStoredZonePolygon,
} from './geo-polygon.util';

describe('geo-polygon.util', () => {
  const square = [
    { lat: -34.6, lng: -58.4 },
    { lat: -34.6, lng: -58.39 },
    { lat: -34.61, lng: -58.39 },
    { lat: -34.61, lng: -58.4 },
  ];

  it('detects point inside polygon ring', () => {
    expect(isPointInPolygonRing({ lat: -34.605, lng: -58.395 }, square)).toBe(
      true,
    );
    expect(isPointInPolygonRing({ lat: -34.59, lng: -58.395 }, square)).toBe(
      false,
    );
  });

  it('matches any ring in zone', () => {
    expect(
      isPointInZoneRings({ lat: -34.605, lng: -58.395 }, [
        [
          { lat: -34.62, lng: -58.42 },
          { lat: -34.62, lng: -58.41 },
          { lat: -34.63, lng: -58.41 },
        ],
        square,
      ]),
    ).toBe(true);
  });

  it('parses stored polygon json', () => {
    const rings = parseStoredZonePolygon({
      rings: [square],
      source: 'nominatim',
    });

    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it('estimates smaller polygon area', () => {
    const small = estimatePolygonAreaSqKm([square]);
    const large = estimatePolygonAreaSqKm([
      [
        { lat: -34.58, lng: -58.42 },
        { lat: -34.58, lng: -58.38 },
        { lat: -34.63, lng: -58.38 },
        { lat: -34.63, lng: -58.42 },
      ],
    ]);

    expect(small).toBeLessThan(large);
  });

  it('normalizes manual polygon rings from editor payload', () => {
    expect(normalizeManualPolygonRings([square])).toHaveLength(1);
    expect(
      normalizeManualPolygonRings([[{ lat: -34.6, lng: -58.4 }]]),
    ).toBeNull();
    expect(normalizeManualPolygonRings([])).toBeNull();
  });
});
