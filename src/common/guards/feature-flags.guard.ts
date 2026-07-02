import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import {
  normalizeRestaurantFeatures,
  type RestaurantFeatureKey,
} from '../utils/restaurant-features.util';

@Injectable()
export class FeatureFlagsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const method = request?.method?.toUpperCase?.() || '';

    if (method === 'OPTIONS') return true;

    const userRole = request?.user?.role;

    const impersonatedBy = request?.user?.impersonatedBy;

    if (userRole === 'SUPER_ADMIN' || impersonatedBy) {
      return true;
    }

    const url = (request?.originalUrl || request?.url || '').toLowerCase();

    const feature = this.getFeatureFromUrl(url);

    if (!feature) return true;

    const restaurantId = await this.resolveRestaurantId(request, feature, url);

    if (!restaurantId) return true;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },

      select: { features: true },
    });

    if (!restaurant) return true;

    const features = normalizeRestaurantFeatures(restaurant.features);

    if (features[feature] === false) {
      throw new ForbiddenException(
        `Feature disabled: ${feature}. Please enable it in restaurant settings.`,
      );
    }

    return true;
  }

  private getFeatureFromUrl(url: string): RestaurantFeatureKey | null {
    if (
      /^\/api\/public\/[^/]+\/menu\b/.test(url) ||
      /^\/api\/restaurants\/[^/]+\/menu\b/.test(url) ||
      /^\/api\/restaurants\/[^/]+\/categories\b/.test(url) ||
      /^\/api\/restaurants\/[^/]+\/dishes\b/.test(url) ||
      /^\/api\/menu\b/.test(url) ||
      /^\/admin\/menu\b/.test(url)
    ) {
      return 'menu';
    }

    if (
      /^\/api\/restaurants\/[^/]+\/orders\b/.test(url) ||
      /^\/api\/orders\b/.test(url) ||
      /^\/admin\/orders\b/.test(url)
    ) {
      return 'orders';
    }

    if (this.isSalonFloorUrl(url)) {
      return 'salon';
    }

    if (/^\/api\/tables\b/.test(url)) {
      return 'tables';
    }

    if (
      /^\/api\/restaurants\/[^/]+\/reservations\b/.test(url) ||
      /^\/api\/reservations\b/.test(url) ||
      /^\/admin\/reservations\b/.test(url)
    ) {
      return 'reservations';
    }

    if (
      /^\/api\/restaurants\/[^/]+\/delivery\b/.test(url) ||
      /^\/api\/delivery\b/.test(url) ||
      /^\/admin\/delivery\b/.test(url)
    ) {
      return 'delivery';
    }

    if (
      /^\/api\/restaurants\/[^/]+\/loyalty\b/.test(url) ||
      /^\/api\/loyalty\b/.test(url)
    ) {
      return 'loyalty';
    }

    if (/^\/api\/restaurants\/[^/]+\/reviews\b/.test(url)) {
      return 'reviews';
    }

    if (/^\/api\/gift-cards\b/.test(url)) {
      return 'giftCards';
    }

    if (/^\/api\/catering\b/.test(url)) {
      return 'catering';
    }

    return null;
  }

  /** Operaciones de piso/salón — excluye turno del día y caja mayor. */

  private isSalonFloorUrl(url: string): boolean {
    if (!/^\/api\/restaurants\/[^/]+\/floor\b/.test(url)) {
      return false;
    }

    if (/^\/api\/restaurants\/[^/]+\/floor\/daily-operation\b/.test(url)) {
      return false;
    }

    if (/^\/api\/restaurants\/[^/]+\/floor\/cash-register\/main\b/.test(url)) {
      return false;
    }

    return true;
  }

  private async resolveRestaurantId(
    request: any,

    feature: RestaurantFeatureKey,

    url: string,
  ): Promise<string | null> {
    const params = request?.params || {};

    if (params.restaurantId) return params.restaurantId;

    if (params.id && url.startsWith('/api/restaurants/')) return params.id;

    if (feature === 'reservations') {
      const reservationId = params.reservationId || params.id;

      if (reservationId && url.startsWith('/api/reservations/')) {
        const reservation = await this.prisma.reservation.findUnique({
          where: { id: reservationId },

          select: { restaurantId: true },
        });

        return reservation?.restaurantId || null;
      }
    }

    if (feature === 'menu') {
      const slug = params.slug;

      if (slug && url.startsWith('/api/public/')) {
        const restaurant = await this.prisma.restaurant.findUnique({
          where: { slug },

          select: { id: true },
        });

        return restaurant?.id || null;
      }
    }

    const userRestaurantId = request?.user?.restaurantId;

    if (userRestaurantId) return userRestaurantId;

    return null;
  }
}
