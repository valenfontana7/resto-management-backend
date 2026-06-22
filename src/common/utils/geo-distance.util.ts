export interface GeoCoordinate {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(
  a: GeoCoordinate,
  b: GeoCoordinate,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

const DEFAULT_SPEED_KMH = 22;

const VEHICLE_SPEED_KMH: Record<string, number> = {
  moto: 28,
  bicicleta: 14,
  bici: 14,
  bike: 14,
  auto: 22,
  car: 22,
};

export function resolveVehicleSpeedKmh(vehicle?: string | null): number {
  const normalized = (vehicle || '').trim().toLowerCase();
  if (!normalized) return DEFAULT_SPEED_KMH;

  for (const [keyword, speed] of Object.entries(VEHICLE_SPEED_KMH)) {
    if (normalized.includes(keyword)) {
      return speed;
    }
  }

  return DEFAULT_SPEED_KMH;
}

export function estimateTravelMinutes(
  distanceKm: number,
  speedKmh = DEFAULT_SPEED_KMH,
): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 1;
  }

  const minutes = (distanceKm / speedKmh) * 60;
  return Math.max(1, Math.ceil(minutes));
}
