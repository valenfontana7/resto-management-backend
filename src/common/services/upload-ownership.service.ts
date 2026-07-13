import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeRoleCode } from '../utils/role.utils';

const PUBLIC_PROXY_PREFIXES = [
  'images/',
  'branding/',
  'logos/',
  'categories/',
  'leads-demos/',
];

/** Assets de marca del restaurante (logo, portada, favicon) bajo S3. */
const PUBLIC_RESTAURANT_ASSET_PREFIX = /^restaurants\/[^/]+\//;

@Injectable()
export class UploadOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  assertPublicProxyKeyAllowed(key: string): void {
    if (!this.isPublicProxyKey(key)) {
      throw new ForbiddenException('Object key is not publicly accessible');
    }
  }

  private isPublicProxyKey(key: string): boolean {
    const normalized = key.replace(/^\/+/, '');
    if (PUBLIC_PROXY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return true;
    }
    return PUBLIC_RESTAURANT_ASSET_PREFIX.test(normalized);
  }

  async assertUserCanManageKey(
    user: {
      userId: string;
      restaurantId?: string | null;
      role?: string | null;
    },
    key: string,
    mode: 'read' | 'delete',
  ): Promise<void> {
    if (normalizeRoleCode(user.role) === 'SUPER_ADMIN') {
      return;
    }

    const restaurantId = user.restaurantId?.trim();
    if (!restaurantId) {
      throw new ForbiddenException('User does not have a restaurant');
    }

    const normalizedKey = key.replace(/^\/+/, '');
    if (!this.isAllowedAssetPrefix(normalizedKey)) {
      throw new ForbiddenException('Invalid object key');
    }

    const referenced = await this.isKeyReferencedByRestaurant(
      restaurantId,
      normalizedKey,
    );

    if (referenced) {
      return;
    }

    if (mode === 'read' && normalizedKey.startsWith('images/')) {
      // Permite previsualizar subidas recientes antes de persistir en menú.
      return;
    }

    throw new ForbiddenException(
      'You can only manage assets linked to your restaurant',
    );
  }

  private isAllowedAssetPrefix(key: string): boolean {
    return this.isPublicProxyKey(key);
  }

  private async isKeyReferencedByRestaurant(
    restaurantId: string,
    key: string,
  ): Promise<boolean> {
    const needle = key.split('/').pop() ?? key;

    const [dishHits, categoryHits, restaurant, builder] = await Promise.all([
      this.prisma.dish.count({
        where: {
          restaurantId,
          OR: [{ image: { contains: key } }, { image: { contains: needle } }],
        },
      }),
      this.prisma.category.count({
        where: {
          restaurantId,
          OR: [{ image: { contains: key } }, { image: { contains: needle } }],
        },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { logo: true, coverImage: true, branding: true },
      }),
      this.prisma.builderConfig.findUnique({
        where: { restaurantId },
        select: { config: true },
      }),
    ]);

    if (dishHits > 0 || categoryHits > 0) {
      return true;
    }

    const restaurantBlob = JSON.stringify({
      logo: restaurant?.logo ?? null,
      coverImage: restaurant?.coverImage ?? null,
      branding: restaurant?.branding ?? null,
    });
    if (restaurantBlob.includes(key) || restaurantBlob.includes(needle)) {
      return true;
    }

    const builderBlob = JSON.stringify(builder?.config ?? {});
    return builderBlob.includes(key) || builderBlob.includes(needle);
  }
}
