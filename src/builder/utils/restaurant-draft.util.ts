import type { RestaurantDraft } from '../types/builder-config.types';

type LooseRecord = Record<string, unknown>;

const DRAFT_KEYS = [
  'name',
  'description',
  'email',
  'phone',
  'address',
  'city',
  'country',
  'postalCode',
  'cuisineTypes',
  'logo',
  'coverImage',
  'type',
  'website',
  'socialMedia',
] as const satisfies readonly (keyof RestaurantDraft)[];

const BUSINESS_INFO_KEYS = [
  'name',
  'description',
  'cuisineTypes',
  'logo',
  'coverImage',
  'type',
  'website',
] as const satisfies readonly (keyof RestaurantDraft)[];

const CONTACT_KEYS = [
  'email',
  'phone',
  'address',
  'city',
  'country',
  'postalCode',
] as const satisfies readonly (keyof RestaurantDraft)[];

function isPlainObject(value: unknown): value is LooseRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pickDraftFields(
  source: LooseRecord | undefined,
  keys: readonly (keyof RestaurantDraft)[],
): Partial<RestaurantDraft> {
  if (!source) {
    return {};
  }

  return keys.reduce<Partial<RestaurantDraft>>((draft, key) => {
    const value = source[key];
    if (value !== undefined) {
      (draft as LooseRecord)[key] = value;
    }
    return draft;
  }, {});
}

export function normalizeRestaurantDraftPayload(
  value: unknown,
): RestaurantDraft | undefined | unknown {
  if (!isPlainObject(value)) {
    return value;
  }

  const businessInfo = isPlainObject(value.businessInfo)
    ? value.businessInfo
    : undefined;
  const contact = isPlainObject(value.contact) ? value.contact : undefined;

  const normalized: RestaurantDraft = {
    ...pickDraftFields(businessInfo, BUSINESS_INFO_KEYS),
    ...pickDraftFields(contact, CONTACT_KEYS),
    ...pickDraftFields(value, DRAFT_KEYS),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}