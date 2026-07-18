export type RestaurantFeatureKey =
  | 'menu'
  | 'orders'
  | 'salon'
  | 'tables'
  | 'reservations'
  | 'delivery'
  | 'loyalty'
  | 'reviews'
  | 'giftCards'
  | 'catering'
  | 'onlineOrdering'
  | 'takeaway'
  | 'socialMedia';

export interface NormalizedRestaurantFeatures {
  menu: boolean;
  orders: boolean;
  salon: boolean;
  tables: boolean;
  reservations: boolean;
  delivery: boolean;
  loyalty: boolean;
  reviews: boolean;
  giftCards: boolean;
  catering: boolean;
  onlineOrdering: boolean;
  takeaway: boolean;
  socialMedia: boolean;
}

const DEFAULTS: NormalizedRestaurantFeatures = {
  menu: true,
  orders: true,
  salon: true,
  tables: false,
  reservations: false,
  delivery: false,
  loyalty: false,
  reviews: false,
  giftCards: false,
  catering: false,
  onlineOrdering: true,
  takeaway: true,
  socialMedia: true,
};

/** Aplica reglas de dependencia entre módulos (mutación in-place). */
export function applyRestaurantFeatureCascade(
  features: NormalizedRestaurantFeatures,
): void {
  if (features.orders === false) {
    features.onlineOrdering = false;
    features.delivery = false;
    features.takeaway = false;
    // Salón/mesas son independientes del canal de pedidos online.
  }

  if (features.salon === false && features.reservations === false) {
    features.tables = false;
  }
}

export function normalizeRestaurantFeatures(
  raw: unknown,
): NormalizedRestaurantFeatures {
  const input =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const normalized: NormalizedRestaurantFeatures = {
    ...DEFAULTS,
    ...(input as Partial<NormalizedRestaurantFeatures>),
  };

  // Compat: antes salón dependía implícitamente de pedidos
  if (input.salon === undefined) {
    normalized.salon = normalized.orders !== false;
  }

  // Compat: mesas se asociaban a reservas o salón
  if (input.tables === undefined) {
    normalized.tables =
      normalized.reservations === true || normalized.salon === true;
  }

  applyRestaurantFeatureCascade(normalized);
  return normalized;
}
