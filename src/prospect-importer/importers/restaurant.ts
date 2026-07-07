import { ProspectBundle, DAY_KEYS } from '../types';
import { MappedMedia } from './media';

export interface MappedRestaurantIdentity {
  id: string;
  name: string;
  slug: string;
  type: string;
  cuisine: string[];
  templateSlug: string;
  location: { city: string; neighborhood: string; address: string };
  contact: { phone: string; email: string; website: string };
  social: { instagram: string; facebook: string };
  description: string;
  founded: number;
  capacity: number;
  priceRange: '$' | '$$' | '$$$' | '$$$$';
  rating: number;
  reviewCount: number;
  images: { logo: string; hero: string; interior: string[]; food: string[] };
  hours: Record<string, string>;
  stats: {
    monthlyOrders: number;
    avgOrderValue: number;
    customerRetention: number;
    onlineOrdersPercentage: number;
  };
}

const BUSINESS_TYPES = new Set([
  'restaurant',
  'bar',
  'cafe',
  'bakery',
  'food-truck',
]);

export function mapRestaurant(
  bundle: ProspectBundle,
  slug: string,
  media: MappedMedia,
  warnings: string[],
): MappedRestaurantIdentity {
  const { prospect, business, social } = bundle;

  const type = BUSINESS_TYPES.has(business.category)
    ? business.category
    : 'restaurant';
  if (!BUSINESS_TYPES.has(business.category)) {
    warnings.push(
      `business.category "${business.category}" no es un tipo Bentoo; se usa "restaurant".`,
    );
  }

  const stats = estimateStats(bundle, warnings);

  return {
    id: slug,
    name: prospect.businessName.trim(),
    slug,
    type,
    cuisine: business.cuisine
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 12),
    templateSlug: pickTemplateSlug(bundle),
    location: {
      city: prospect.city.trim(),
      neighborhood: prospect.neighborhood?.trim() ?? '',
      address: prospect.address?.trim() ?? '',
    },
    contact: {
      phone: readSocial(social, 'phone'),
      email: readSocial(social, 'email'),
      website: readSocial(social, 'website'),
    },
    social: {
      instagram: readSocial(social, 'instagram'),
      facebook: readSocial(social, 'facebook'),
    },
    description: business.description.trim(),
    founded: business.foundedYear ?? new Date().getFullYear(),
    capacity: business.capacity ?? 0,
    priceRange: derivePriceRange(business.averageTicket?.value),
    rating: business.rating ?? 0,
    reviewCount: business.reviewCount ?? 0,
    images: mapImages(bundle, media),
    hours: mapHours(bundle),
    stats,
  };
}

function readSocial(social: ProspectBundle['social'], key: string): string {
  const entry = social?.[key];
  if (!entry || entry.value == null) return '';
  return String(entry.value);
}

function derivePriceRange(
  averageTicket?: number,
): MappedRestaurantIdentity['priceRange'] {
  if (!averageTicket) return '$$';
  if (averageTicket < 8_000) return '$';
  if (averageTicket < 25_000) return '$$';
  if (averageTicket < 45_000) return '$$$';
  return '$$$$';
}

function mapImages(bundle: ProspectBundle, media: MappedMedia) {
  const byType = (type: string) =>
    media.manifest.filter((m) => m.type === type).map((m) => m.url);

  const logoId = bundle.branding.logo?.mediaId;
  const logo = (logoId && media.urlById.get(logoId)) || byType('logo')[0] || '';
  const hero = byType('hero')[0] || '';
  const interior = byType('ambient');

  // Miniaturas de comida: los productos destacados de la homepage, si existen.
  const featuredIds =
    (bundle.sections.featuredProducts?.content?.productIds as
      | string[]
      | undefined) ?? [];
  const featuredImages = featuredIds
    .map((productId) => {
      const product = bundle.menu.products.find((p) => p.id === productId);
      return product ? media.urlById.get(product.imageReference) : undefined;
    })
    .filter((url): url is string => Boolean(url));

  const food = [
    ...new Set(featuredImages.length ? featuredImages : byType('dish')),
  ].slice(0, 4);

  return { logo, hero, interior, food };
}

function mapHours(bundle: ProspectBundle): Record<string, string> {
  const hours: Record<string, string> = {};
  for (const day of DAY_KEYS) {
    const ranges = bundle.business.openingHours[day] ?? [];
    hours[day] = ranges.length
      ? ranges.map((r) => `${r.open}-${r.close}`).join(', ')
      : 'Cerrado';
  }
  return hours;
}

function estimateStats(bundle: ProspectBundle, warnings: string[]) {
  const avgOrderValue = bundle.business.averageTicket?.value ?? 0;
  if (!bundle.business.averageTicket) {
    warnings.push(
      'business.averageTicket no informado; stats demo con ticket 0.',
    );
  }

  // Métricas demo ilustrativas (el panel demo las muestra como ejemplo).
  return {
    monthlyOrders: 1500,
    avgOrderValue,
    customerRetention: 60,
    onlineOrdersPercentage: 35,
  };
}

/** Heurística de plantilla visual (fallback de imágenes del demo si faltara branding). */
function pickTemplateSlug(bundle: ProspectBundle): string {
  const text = [
    bundle.business.category,
    ...bundle.business.cuisine,
    bundle.prospect.businessName,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (/sushi|japon|korean|corean|asiat/.test(text)) return 'sushi-express';
  if (/pizza|pizzer/.test(text)) return 'pizza-artesanal';
  if (/parrilla|asado|steak|grill/.test(text)) return 'la-parrilla';
  if (/burger|hamburg/.test(text)) return 'burger-lab';
  if (/cafe|cafeter|coffee|bakery|panader|brunch/.test(text))
    return 'cafe-central';
  return 'pizza-artesanal';
}
