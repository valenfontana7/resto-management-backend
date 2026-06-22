import {
  estimateTravelMinutes,
  haversineDistanceKm,
  resolveVehicleSpeedKmh,
} from '../../common/utils/geo-distance.util';

const LIVE_ETA_STATUSES = new Set(['PICKED_UP', 'IN_TRANSIT']);

export interface LiveDeliveryEta {
  liveEtaMinutes: number | null;
  distanceKmRemaining: number | null;
  liveEtaUpdatedAt: string | null;
}

export function computeLiveDeliveryEta(input: {
  status: string;
  driverLat?: unknown;
  driverLng?: unknown;
  destinationLat?: unknown;
  destinationLng?: unknown;
  vehicle?: string | null;
  locationUpdatedAt?: Date | string | null;
  maxLocationAgeMinutes?: number;
}): LiveDeliveryEta {
  const {
    status,
    driverLat,
    driverLng,
    destinationLat,
    destinationLng,
    vehicle,
    locationUpdatedAt,
    maxLocationAgeMinutes = 15,
  } = input;

  if (!LIVE_ETA_STATUSES.has(status)) {
    return emptyLiveEta();
  }

  const driverCoordinate = toCoordinatePair(driverLat, driverLng);
  const destinationCoordinate = toCoordinatePair(
    destinationLat,
    destinationLng,
  );

  if (!driverCoordinate || !destinationCoordinate) {
    return emptyLiveEta();
  }

  if (locationUpdatedAt) {
    const updatedAt = new Date(locationUpdatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      return emptyLiveEta();
    }

    const ageMs = Date.now() - updatedAt.getTime();
    if (ageMs > maxLocationAgeMinutes * 60 * 1000) {
      return emptyLiveEta();
    }
  }

  const distanceKm = haversineDistanceKm(
    driverCoordinate,
    destinationCoordinate,
  );

  const speedKmh = resolveVehicleSpeedKmh(vehicle);
  const liveEtaMinutes = estimateTravelMinutes(distanceKm, speedKmh) + 2;

  return {
    liveEtaMinutes,
    distanceKmRemaining: Math.round(distanceKm * 10) / 10,
    liveEtaUpdatedAt: locationUpdatedAt
      ? new Date(locationUpdatedAt).toISOString()
      : null,
  };
}

function emptyLiveEta(): LiveDeliveryEta {
  return {
    liveEtaMinutes: null,
    distanceKmRemaining: null,
    liveEtaUpdatedAt: null,
  };
}

function toCoordinate(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toCoordinatePair(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  const parsedLat = toCoordinate(lat);
  const parsedLng = toCoordinate(lng);

  if (parsedLat == null || parsedLng == null) {
    return null;
  }

  return { lat: parsedLat, lng: parsedLng };
}
