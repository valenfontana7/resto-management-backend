import { asOptionalString } from '../common/json-coerce';

const DEMO_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type DemoDayKey = (typeof DEMO_DAY_KEYS)[number];

type HoursDay = {
  isOpen: boolean;
  timeRanges: Array<{ openTime: string; closeTime: string }>;
};

export type ParsedOnboardingHours = Record<DemoDayKey, HoursDay>;

export function slugifyRestaurantName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function buildSuggestedRestaurantSlug(
  restaurantName: string,
  demoSlug: string,
): string {
  const base =
    slugifyRestaurantName(restaurantName) || slugifyRestaurantName(demoSlug);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'restaurante'}-${suffix}`;
}

export function parseDemoPayloadHours(
  hours?: Record<string, string> | null,
): ParsedOnboardingHours {
  const fallback: Record<DemoDayKey, string> = {
    monday: '12:00-15:00, 20:00-00:00',
    tuesday: '12:00-15:00, 20:00-00:00',
    wednesday: '12:00-15:00, 20:00-00:00',
    thursday: '12:00-15:00, 20:00-00:00',
    friday: '12:00-15:00, 20:00-00:00',
    saturday: '12:00-15:00, 20:00-00:00',
    sunday: 'Cerrado',
  };

  const result = {} as ParsedOnboardingHours;

  for (const day of DEMO_DAY_KEYS) {
    const value = String(hours?.[day] ?? fallback[day] ?? '').trim();
    const isClosed = value.toLowerCase().includes('cerrado');
    const timeRanges = isClosed
      ? []
      : value
          .split(',')
          .map((range) => range.trim())
          .filter(Boolean)
          .map((range) => {
            const [openTime, closeTime] = range.split('-');
            return {
              openTime: (openTime || '12:00').trim(),
              closeTime: (closeTime || '22:00').trim(),
            };
          });

    result[day] = {
      isOpen: !isClosed && timeRanges.length > 0,
      timeRanges,
    };
  }

  return result;
}

export function normalizeBusinessType(
  raw: unknown,
): 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'food-truck' | 'other' {
  const value = asOptionalString(raw, 'restaurant').toLowerCase();
  if (
    value === 'cafe' ||
    value === 'bar' ||
    value === 'bakery' ||
    value === 'food-truck' ||
    value === 'other'
  ) {
    return value;
  }
  return 'restaurant';
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function pickImageRef(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function mapDemoMenuCategories(menu: unknown): Array<{
  id: string;
  name: string;
  description: string;
}> {
  if (!Array.isArray(menu)) return [];

  return menu
    .map((entry, index) => {
      const row = asRecord(entry);
      if (!row) return null;
      const name = asOptionalString(row.name).trim();
      if (!name) return null;
      return {
        id: asOptionalString(row.id, `cat-${index + 1}`),
        name,
        description: asOptionalString(row.description).trim(),
      };
    })
    .filter(
      (item): item is { id: string; name: string; description: string } =>
        item !== null,
    );
}

export function countDemoDishes(menu: unknown): number {
  if (!Array.isArray(menu)) return 0;
  return menu.reduce((total, entry) => {
    const row = asRecord(entry);
    const dishes = row?.dishes;
    return total + (Array.isArray(dishes) ? dishes.length : 0);
  }, 0);
}

export function buildBuilderDraftFromPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const explicit = asRecord(payload.builderConfig);
  if (explicit) return explicit;

  const branding = asRecord(payload.branding);
  const seo = asRecord(payload.seo);

  const draft: Record<string, unknown> = {
    lastModified: new Date().toISOString(),
  };

  if (branding?.theme) draft.theme = branding.theme;
  if (branding?.layout) draft.layout = branding.layout;
  if (branding?.assets) draft.assets = branding.assets;
  if (branding?.sections) draft.sections = branding.sections;
  if (branding?.mobileMenu) draft.mobileMenu = branding.mobileMenu;
  if (seo) {
    const assets = asRecord(branding?.assets);
    draft.seo = {
      title: seo.title,
      description: seo.description,
      keywords: seo.keywords,
      ogImage:
        seo.ogImage ??
        (typeof assets?.coverImage === 'string'
          ? assets.coverImage
          : undefined) ??
        (typeof assets?.bannerImage === 'string'
          ? assets.bannerImage
          : undefined),
    };
  }

  return draft;
}

export type DemoMenuCategoryPayload = {
  id?: string;
  name: string;
  description?: string;
  order?: number;
  image?: string;
  dishes?: DemoDishPayload[];
};

export type DemoDishPayload = {
  id?: string;
  name: string;
  description?: string;
  price?: number;
  image?: string;
  isFeatured?: boolean;
  preparationTime?: number;
  allergens?: string[];
};

export function extractDemoMenu(menu: unknown): DemoMenuCategoryPayload[] {
  if (!Array.isArray(menu)) return [];

  const categories: DemoMenuCategoryPayload[] = [];

  for (const entry of menu) {
    const row = asRecord(entry);
    if (!row || typeof row.name !== 'string') continue;
    const name = row.name.trim();
    if (!name) continue;

    const dishes: DemoDishPayload[] = [];
    if (Array.isArray(row.dishes)) {
      for (const dish of row.dishes) {
        const dishRow = asRecord(dish);
        if (!dishRow || typeof dishRow.name !== 'string') continue;
        const dishName = dishRow.name.trim();
        if (!dishName) continue;
        dishes.push({
          id: typeof dishRow.id === 'string' ? dishRow.id : undefined,
          name: dishName,
          description:
            typeof dishRow.description === 'string'
              ? dishRow.description
              : undefined,
          price: typeof dishRow.price === 'number' ? dishRow.price : undefined,
          image: typeof dishRow.image === 'string' ? dishRow.image : undefined,
          isFeatured: dishRow.isFeatured === true,
          preparationTime:
            typeof dishRow.preparationTime === 'number'
              ? dishRow.preparationTime
              : undefined,
          allergens: asStringArray(dishRow.allergens),
        });
      }
    }

    categories.push({
      id: typeof row.id === 'string' ? row.id : undefined,
      name,
      description:
        typeof row.description === 'string' ? row.description : undefined,
      order: typeof row.order === 'number' ? row.order : undefined,
      image: typeof row.image === 'string' ? row.image : undefined,
      dishes,
    });
  }

  return categories;
}

export function remapFeaturedDishIds(
  config: Record<string, unknown>,
  dishIdMap: Map<string, string>,
): Record<string, unknown> {
  const clone = structuredClone(config);
  const sections = asRecord(clone.sections);
  if (!sections) return clone;

  const featured = asRecord(sections.featured);
  if (!featured || !Array.isArray(featured.dishIds)) return clone;

  featured.dishIds = featured.dishIds
    .map((id) => (typeof id === 'string' ? (dishIdMap.get(id) ?? id) : id))
    .filter((id): id is string => typeof id === 'string');

  sections.featured = featured;
  clone.sections = sections;
  return clone;
}
