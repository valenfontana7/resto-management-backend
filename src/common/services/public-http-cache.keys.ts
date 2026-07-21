export const PUBLIC_MENU_CACHE_KEY_PREFIX = 'public-menu:v1:';

export const PUBLIC_RESTAURANTS_CACHE_KEY = 'public-restaurants:v1';

export function publicMenuCacheKey(slug: string): string {
  return `${PUBLIC_MENU_CACHE_KEY_PREFIX}${String(slug || '')
    .trim()
    .toLowerCase()}`;
}
