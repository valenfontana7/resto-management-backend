type RestaurantLogoSource = {
  logo?: string | null;
  branding?: unknown;
};

function pickLogo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resuelve el logo del restaurante desde la columna Prisma o branding persistido.
 */
export function resolveRestaurantLogo(
  restaurant: RestaurantLogoSource | null | undefined,
): string | null {
  if (!restaurant) return null;

  const direct = pickLogo(restaurant.logo);
  if (direct) return direct;

  const branding =
    restaurant.branding &&
    typeof restaurant.branding === 'object' &&
    !Array.isArray(restaurant.branding)
      ? (restaurant.branding as Record<string, unknown>)
      : null;

  if (!branding) return null;

  const assets =
    branding.assets &&
    typeof branding.assets === 'object' &&
    !Array.isArray(branding.assets)
      ? (branding.assets as Record<string, unknown>)
      : null;

  return pickLogo(assets?.logo) ?? pickLogo(branding.logo);
}
