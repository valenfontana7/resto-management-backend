/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { RestaurantDraft } from '../types/builder-config.types';

type LooseRecord = Record<string, unknown>;

// Evitar advertencia de tipos redundantes en análisis estático

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
] as const;

const BUSINESS_INFO_KEYS = [
  'name',
  'description',
  'cuisineTypes',
  'logo',
  'coverImage',
  'type',
  'website',
] as const;

const CONTACT_KEYS = [
  'email',
  'phone',
  'address',
  'city',
  'country',
  'postalCode',
] as const;

function isPlainObject(value: unknown): value is LooseRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pickDraftFields(
  source: LooseRecord | undefined,
  keys: readonly string[],
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

function normalizeCuisineTypes(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) =>
        typeof item === 'string'
          ? item.split(',').map((entry) => entry.trim())
          : [],
      )
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return undefined;
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

  const cuisineSource =
    normalized.cuisineTypes !== undefined
      ? normalized.cuisineTypes
      : (businessInfo?.cuisineTypes ?? value.cuisineTypes);

  const normalizedCuisineTypes = normalizeCuisineTypes(cuisineSource);

  if (normalizedCuisineTypes !== undefined) {
    normalized.cuisineTypes = normalizedCuisineTypes;
  } else if (typeof normalized.cuisineTypes === 'string') {
    delete (normalized as LooseRecord).cuisineTypes;
  }

  // Compatibilidad: si la web se cargó en socialMedia.website, reflejarla
  // en el campo plano website que usa el flujo de publicación.
  if (
    normalized.website === undefined &&
    isPlainObject(normalized.socialMedia) &&
    typeof normalized.socialMedia.website === 'string'
  ) {
    const normalizedWebsite = normalized.socialMedia.website.trim();
    if (normalizedWebsite.length > 0) {
      normalized.website = normalizedWebsite;
    }
  }

  // Compatibilidad inversa: si website plano existe y socialMedia ya existe
  // (con redes), completar socialMedia.website para consumidores legacy.
  if (
    typeof normalized.website === 'string' &&
    isPlainObject(normalized.socialMedia) &&
    (typeof normalized.socialMedia.website !== 'string' ||
      normalized.socialMedia.website.trim().length === 0)
  ) {
    const normalizedWebsite = normalized.website.trim();
    if (normalizedWebsite.length > 0) {
      normalized.socialMedia = {
        ...normalized.socialMedia,
        website: normalizedWebsite,
      };
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
