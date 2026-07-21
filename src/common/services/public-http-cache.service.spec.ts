import { PublicHttpCacheService } from './public-http-cache.service';
import {
  PUBLIC_RESTAURANTS_CACHE_KEY,
  publicMenuCacheKey,
} from './public-http-cache.keys';

describe('PublicHttpCacheService', () => {
  const cache = {
    del: jest.fn().mockResolvedValue(true),
  };
  const prisma = {
    restaurant: {
      findUnique: jest.fn(),
    },
  };

  const service = new PublicHttpCacheService(cache as any, prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a stable per-slug menu cache key', () => {
    expect(publicMenuCacheKey('la-parrilla')).toBe(
      'public-menu:v1:la-parrilla',
    );
  });

  it('invalidates public menu cache by slug', async () => {
    await service.invalidatePublicMenuBySlug('la-parrilla');

    expect(cache.del).toHaveBeenCalledWith('public-menu:v1:la-parrilla');
  });

  it('resolves slug from restaurantId before invalidating menu cache', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ slug: 'la-parrilla' });

    await service.invalidatePublicMenuByRestaurantId('rest-1');

    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'rest-1' },
      select: { slug: true },
    });
    expect(cache.del).toHaveBeenCalledWith('public-menu:v1:la-parrilla');
  });

  it('skips menu invalidation when restaurant has no slug', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    await service.invalidatePublicMenuByRestaurantId('missing');

    expect(cache.del).not.toHaveBeenCalled();
  });

  it('invalidates the public restaurants directory cache', async () => {
    await service.invalidatePublicRestaurants();

    expect(cache.del).toHaveBeenCalledWith(PUBLIC_RESTAURANTS_CACHE_KEY);
  });
});
