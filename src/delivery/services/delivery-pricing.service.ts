import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type QuoteInput = {
  type?: 'pickup' | 'delivery';
  subtotal?: number;
  address?: string;
  zoneId?: string;
};

type ZoneSummary = {
  id: string;
  name: string;
  deliveryFee: number;
  minOrder: number;
  estimatedTime?: string | null;
  areas: string[];
};

type DeliveryBusinessRules = {
  enabled?: boolean;
  freeDeliveryThreshold?: number;
};

type RestaurantDeliveryFlags = {
  businessRules: DeliveryBusinessRules;
  featureEnabled?: boolean;
};

export type DeliveryQuote = {
  available: boolean;
  type: 'pickup' | 'delivery';
  provider: 'internal' | 'platform';
  dispatchMode: 'pickup' | 'internal' | 'external' | 'manual';
  deliveryFee: number;
  minOrder: number;
  estimatedTime?: string | null;
  zone: ZoneSummary | null;
  zones: ZoneSummary[];
  requiresZoneSelection: boolean;
  matchedBy: 'none' | 'zoneId' | 'address' | 'single-zone';
  freeDeliveryThreshold?: number;
  message?: string;
  externalPlatform?: string;
};

@Injectable()
export class DeliveryPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quoteDelivery(
    restaurantId: string,
    input: QuoteInput,
  ): Promise<DeliveryQuote> {
    const type = input.type === 'delivery' ? 'delivery' : 'pickup';

    if (type === 'pickup') {
      return {
        available: true,
        type,
        provider: 'internal',
        dispatchMode: 'pickup',
        deliveryFee: 0,
        minOrder: 0,
        estimatedTime: null,
        zone: null,
        zones: [],
        requiresZoneSelection: false,
        matchedBy: 'none',
      };
    }

    const [restaurant, zones, activePlatform] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { businessRules: true, features: true },
      }),
      this.prisma.deliveryZone.findMany({
        where: { restaurantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.deliveryPlatform.findFirst({
        where: { restaurantId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { platform: true },
      }),
    ]);

    const deliveryRules = this.parseRestaurantDeliveryFlags(restaurant);
    const normalizedZones = zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      deliveryFee: zone.deliveryFee,
      minOrder: zone.minOrder,
      estimatedTime: zone.estimatedTime,
      areas: Array.isArray(zone.areas) ? zone.areas : [],
    }));

    const deliveryEnabled = this.isDeliveryEnabled({
      deliveryRules,
      hasActiveZones: normalizedZones.length > 0,
      hasActivePlatform: Boolean(activePlatform),
    });

    if (!deliveryEnabled) {
      return {
        available: false,
        type,
        provider: activePlatform ? 'platform' : 'internal',
        dispatchMode: activePlatform ? 'external' : 'manual',
        deliveryFee: 0,
        minOrder: 0,
        estimatedTime: null,
        zone: null,
        zones: normalizedZones,
        requiresZoneSelection: false,
        matchedBy: 'none',
        freeDeliveryThreshold:
          deliveryRules.businessRules.freeDeliveryThreshold,
        message: 'El delivery no está habilitado para este restaurante.',
        externalPlatform: activePlatform?.platform,
      };
    }

    if (normalizedZones.length === 0) {
      return {
        available: false,
        type,
        provider: activePlatform ? 'platform' : 'internal',
        dispatchMode: activePlatform ? 'external' : 'manual',
        deliveryFee: 0,
        minOrder: 0,
        estimatedTime: null,
        zone: null,
        zones: normalizedZones,
        requiresZoneSelection: false,
        matchedBy: 'none',
        freeDeliveryThreshold:
          deliveryRules.businessRules.freeDeliveryThreshold,
        message: 'No hay zonas de delivery configuradas.',
        externalPlatform: activePlatform?.platform,
      };
    }

    const { zone, matchedBy } = this.resolveZone(
      normalizedZones,
      input.zoneId,
      input.address,
    );

    if (!zone) {
      return {
        available: false,
        type,
        provider: activePlatform ? 'platform' : 'internal',
        dispatchMode: activePlatform ? 'external' : 'manual',
        deliveryFee: 0,
        minOrder: 0,
        estimatedTime: null,
        zone: null,
        zones: normalizedZones,
        requiresZoneSelection: normalizedZones.length > 1,
        matchedBy,
        freeDeliveryThreshold:
          deliveryRules.businessRules.freeDeliveryThreshold,
        message:
          normalizedZones.length > 1
            ? 'Seleccioná una zona de entrega válida para calcular el envío.'
            : 'No se pudo resolver una zona de delivery válida.',
        externalPlatform: activePlatform?.platform,
      };
    }

    const freeDeliveryThreshold =
      deliveryRules.businessRules.freeDeliveryThreshold;
    const subtotal = Number(input.subtotal ?? 0);
    const qualifiesForFreeDelivery =
      typeof freeDeliveryThreshold === 'number' &&
      freeDeliveryThreshold > 0 &&
      subtotal >= freeDeliveryThreshold;

    return {
      available: true,
      type,
      provider: activePlatform ? 'platform' : 'internal',
      dispatchMode: activePlatform ? 'external' : 'internal',
      deliveryFee: qualifiesForFreeDelivery ? 0 : zone.deliveryFee,
      minOrder: zone.minOrder,
      estimatedTime: zone.estimatedTime,
      zone,
      zones: normalizedZones,
      requiresZoneSelection: false,
      matchedBy,
      freeDeliveryThreshold,
      externalPlatform: activePlatform?.platform,
    };
  }

  private resolveZone(
    zones: ZoneSummary[],
    zoneId?: string,
    address?: string,
  ): {
    zone: ZoneSummary | null;
    matchedBy: DeliveryQuote['matchedBy'];
  } {
    if (zoneId) {
      const zone = zones.find((candidate) => candidate.id === zoneId) ?? null;
      return {
        zone,
        matchedBy: zone ? 'zoneId' : 'none',
      };
    }

    const normalizedAddress = this.normalizeText(address);
    if (normalizedAddress) {
      const zone = zones.find((candidate) =>
        [candidate.name, ...candidate.areas].some((value) => {
          const normalizedValue = this.normalizeText(value);
          return (
            normalizedValue.length > 0 &&
            (normalizedAddress.includes(normalizedValue) ||
              normalizedValue.includes(normalizedAddress))
          );
        }),
      );

      if (zone) {
        return { zone, matchedBy: 'address' };
      }
    }

    if (zones.length === 1) {
      return { zone: zones[0], matchedBy: 'single-zone' };
    }

    return { zone: null, matchedBy: 'none' };
  }

  private parseRestaurantDeliveryFlags(
    restaurant: { businessRules?: unknown; features?: unknown } | null,
  ): RestaurantDeliveryFlags {
    const businessRules = restaurant?.businessRules;
    if (!businessRules || typeof businessRules !== 'object') {
      return {
        businessRules: {},
        featureEnabled: this.parseFeatureEnabled(restaurant?.features),
      };
    }

    const delivery = (businessRules as Record<string, unknown>).delivery;
    if (!delivery || typeof delivery !== 'object') {
      return {
        businessRules: {},
        featureEnabled: this.parseFeatureEnabled(restaurant?.features),
      };
    }

    const data = delivery as Record<string, unknown>;
    return {
      businessRules: {
        enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined,
        freeDeliveryThreshold:
          typeof data.freeDeliveryThreshold === 'number'
            ? data.freeDeliveryThreshold
            : undefined,
      },
      featureEnabled: this.parseFeatureEnabled(restaurant?.features),
    };
  }

  private parseFeatureEnabled(features: unknown): boolean | undefined {
    if (!features || typeof features !== 'object') {
      return undefined;
    }

    const delivery = (features as Record<string, unknown>).delivery;
    return typeof delivery === 'boolean' ? delivery : undefined;
  }

  private isDeliveryEnabled(input: {
    deliveryRules: RestaurantDeliveryFlags;
    hasActiveZones: boolean;
    hasActivePlatform: boolean;
  }): boolean {
    const {
      deliveryRules: { businessRules, featureEnabled },
      hasActiveZones,
      hasActivePlatform,
    } = input;

    if (businessRules.enabled === true || featureEnabled === true) {
      return true;
    }

    if (hasActiveZones || hasActivePlatform) {
      return true;
    }

    if (businessRules.enabled === false || featureEnabled === false) {
      return false;
    }

    return false;
  }

  private normalizeText(value?: string | null): string {
    if (!value) return '';

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
