export interface GeoPoint {
  lat: number;
  lng: number;
}

export function parseStoredZonePolygon(value: unknown): GeoPoint[][] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const rings = (value as StoredZonePolygon).rings;
  if (!Array.isArray(rings)) {
    return [];
  }

  return rings
    .map((ring) =>
      Array.isArray(ring)
        ? ring
            .map((point) => ({
              lat: Number(point.lat),
              lng: Number(point.lng),
            }))
            .filter(
              (point) =>
                Number.isFinite(point.lat) && Number.isFinite(point.lng),
            )
        : [],
    )
    .filter((ring) => ring.length >= 3);
}

/** Ray-casting: true si el punto cae dentro del anillo (lat/lng). */
export function isPointInPolygonRing(
  point: GeoPoint,
  ring: GeoPoint[],
): boolean {
  if (ring.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const current = ring[index];
    const prior = ring[previous];

    const intersects =
      current.lng > point.lng !== prior.lng > point.lng &&
      point.lat <
        ((prior.lat - current.lat) * (point.lng - current.lng)) /
          (prior.lng - current.lng + Number.EPSILON) +
          current.lat;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export interface StoredZonePolygon {
  rings?: GeoPoint[][];
  source?: string;
  updatedAt?: string;
}

/** Valida anillos enviados manualmente desde el editor de mapa. */
export function normalizeManualPolygonRings(
  rings: unknown,
): GeoPoint[][] | null {
  if (!Array.isArray(rings) || rings.length === 0) {
    return null;
  }

  const parsed = parseStoredZonePolygon({ rings });
  return parsed.length > 0 ? parsed : null;
}

export function isPointInZoneRings(
  point: GeoPoint,
  rings: GeoPoint[][],
): boolean {
  return rings.some((ring) => isPointInPolygonRing(point, ring));
}

export function estimatePolygonAreaSqKm(rings: GeoPoint[][]): number {
  if (rings.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return rings.reduce((total, ring) => total + estimateRingAreaSqKm(ring), 0);
}

function estimateRingAreaSqKm(ring: GeoPoint[]): number {
  if (ring.length < 3) {
    return Number.POSITIVE_INFINITY;
  }

  const latRad = (ring[0].lat * Math.PI) / 180;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos(latRad);

  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area +=
      (current.lng * metersPerDegreeLng * next.lat * metersPerDegreeLat -
        next.lng * metersPerDegreeLng * current.lat * metersPerDegreeLat) /
      2;
  }

  return Math.abs(area) / 1_000_000;
}
