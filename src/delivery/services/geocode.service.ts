import { Injectable, Logger } from '@nestjs/common';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface GeoPolygonPoint {
  lat: number;
  lng: number;
}

export type ZonePolygonSource = 'nominatim' | 'circle';

export interface StoredZonePolygon {
  rings: GeoPolygonPoint[][];
  source: ZonePolygonSource;
  updatedAt: string;
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly cache = new Map<string, GeoCoordinates | null>();

  async geocode(query: string): Promise<GeoCoordinates | null> {
    if (isLabRuntime()) {
      return null;
    }
    const normalized = this.normalizeQuery(query);
    if (!normalized) {
      return null;
    }

    if (this.cache.has(normalized)) {
      return this.cache.get(normalized) ?? null;
    }

    const coords = await this.fetchFromNominatim(query.trim());
    this.cache.set(normalized, coords);
    return coords;
  }

  async coordinatesForDeliveryAddress(
    address: string,
    context?: { city?: string | null; country?: string | null },
  ): Promise<{ deliveryLat?: number; deliveryLng?: number }> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      return {};
    }

    const query = [trimmedAddress, context?.city, context?.country]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');

    const coords = await this.geocode(query);
    if (!coords) {
      return {};
    }

    return {
      deliveryLat: coords.lat,
      deliveryLng: coords.lng,
    };
  }

  async geocodeBatch(
    queries: string[],
  ): Promise<Record<string, GeoCoordinates | null>> {
    const uniqueQueries = [
      ...new Set(queries.map((query) => query.trim()).filter(Boolean)),
    ];
    const results: Record<string, GeoCoordinates | null> = {};

    for (const query of uniqueQueries) {
      results[query] = await this.geocode(query);
      await this.delay(350);
    }

    return results;
  }

  async buildZonePolygonsFromAreas(
    areas: string[],
    context?: { city?: string | null; country?: string | null },
  ): Promise<StoredZonePolygon | null> {
    const normalizedAreas = areas.map((area) => area.trim()).filter(Boolean);
    if (normalizedAreas.length === 0) {
      return null;
    }

    const rings: GeoPolygonPoint[][] = [];
    let source: ZonePolygonSource = 'nominatim';

    for (const area of normalizedAreas) {
      const query = [area, context?.city, context?.country]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ');

      const polygonRing = await this.fetchPolygonRingFromNominatim(query);
      if (polygonRing) {
        rings.push(polygonRing);
      } else {
        const center = await this.geocode(query);
        if (center) {
          rings.push(this.buildCirclePolygon(center));
          source = 'circle';
        }
      }

      await this.delay(350);
    }

    if (rings.length === 0) {
      return null;
    }

    return {
      rings,
      source,
      updatedAt: new Date().toISOString(),
    };
  }

  private async fetchFromNominatim(
    query: string,
  ): Promise<GeoCoordinates | null> {
    try {
      const result = await this.fetchNominatimResult(query, false);
      return result?.coords ?? null;
    } catch (error) {
      this.logger.warn(`Geocode failed for "${query}": ${String(error)}`);
      return null;
    }
  }

  private async fetchPolygonRingFromNominatim(
    query: string,
  ): Promise<GeoPolygonPoint[] | null> {
    try {
      const result = await this.fetchNominatimResult(query, true);
      return result?.polygonRing ?? null;
    } catch (error) {
      this.logger.warn(
        `Polygon geocode failed for "${query}": ${String(error)}`,
      );
      return null;
    }
  }

  private async fetchNominatimResult(
    query: string,
    includePolygon: boolean,
  ): Promise<{
    coords: GeoCoordinates;
    polygonRing?: GeoPolygonPoint[];
  } | null> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    if (includePolygon) {
      url.searchParams.set('polygon_geojson', '1');
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es',
        'User-Agent': 'BentooDeliveryAdmin/1.0 (contact@bentoo.com.ar)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      geojson?: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: number[][][] | number[][][][];
      };
    }>;

    if (!results.length) {
      return null;
    }

    const lat = Number.parseFloat(results[0].lat);
    const lng = Number.parseFloat(results[0].lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const polygonRing = includePolygon
      ? this.extractPolygonRing(results[0].geojson)
      : undefined;

    return {
      coords: { lat, lng },
      polygonRing: polygonRing ?? undefined,
    };
  }

  private extractPolygonRing(geojson?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  }): GeoPolygonPoint[] | null {
    if (!geojson) {
      return null;
    }

    if (geojson.type === 'Polygon') {
      const polygonCoords = geojson.coordinates as number[][][];
      return this.ringFromGeoJsonCoordinates(polygonCoords[0]);
    }

    const multi = geojson.coordinates as number[][][][];
    if (!Array.isArray(multi) || multi.length === 0) {
      return null;
    }

    const largest = multi.reduce((best, current) => {
      const bestRing = best?.[0] ?? [];
      const currentRing = current?.[0] ?? [];
      return currentRing.length > bestRing.length ? current : best;
    });

    return this.ringFromGeoJsonCoordinates(largest?.[0]);
  }

  private ringFromGeoJsonCoordinates(
    ring?: number[][],
  ): GeoPolygonPoint[] | null {
    if (!Array.isArray(ring) || ring.length < 3) {
      return null;
    }

    return ring
      .map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }))
      .filter(
        (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
      );
  }

  private buildCirclePolygon(
    center: GeoCoordinates,
    radiusKm = 0.75,
    steps = 32,
  ): GeoPolygonPoint[] {
    const ring: GeoPolygonPoint[] = [];
    const latRad = (center.lat * Math.PI) / 180;
    const lngFactor = Math.cos(latRad) || 0.0001;

    for (let index = 0; index <= steps; index += 1) {
      const angle = (index / steps) * 2 * Math.PI;
      const latOffset = (radiusKm / 6371) * (180 / Math.PI) * Math.sin(angle);
      const lngOffset =
        ((radiusKm / 6371) * (180 / Math.PI) * Math.cos(angle)) / lngFactor;
      ring.push({
        lat: center.lat + latOffset,
        lng: center.lng + lngOffset,
      });
    }

    return ring;
  }

  private normalizeQuery(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
