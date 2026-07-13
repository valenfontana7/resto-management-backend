import {
  DAY_KEYS,
  type DayKey,
  type ProspectBundle,
} from '../prospect-importer/types';
import { normalizeSlug } from '../prospect-importer/mapper';
import { asOptionalString } from '../common/json-coerce';
import type {
  ProspectBusinessBlock,
  ProspectContentBlock,
  ProspectMenuBlock,
} from './types/prospect-bundle-ai.types';

const DEFAULT_THEME = {
  borderRadius: 'md',
  spacing: 'comfortable',
  shadows: 'soft',
  cardStyle: 'elevated',
  buttonStyle: 'rounded-solid',
  sectionSpacing: 'lg',
  animationStyle: 'subtle-fade',
  layoutDensity: 'balanced',
  heroOverlay: { color: '#000000', opacity: 52 },
  menuLayout: 'grid',
  categoryDisplay: 'tabs',
  maxWidth: 'xl',
};

const DRINK_PLACEHOLDERS = [
  {
    id: 'media-limonada',
    type: 'drink',
    source: 'PLACEHOLDER' as const,
    filename: '../../dishes/limonada.jpg',
    alt: 'Jugo natural',
    priority: 'low',
    prompt: null,
    note: 'Asset del catálogo demo Bentoo reutilizado',
  },
  {
    id: 'media-cerveza',
    type: 'drink',
    source: 'PLACEHOLDER' as const,
    filename: '../../dishes/cerveza.jpg',
    alt: 'Cerveza',
    priority: 'low',
    prompt: null,
    note: 'Asset del catálogo demo Bentoo reutilizado',
  },
  {
    id: 'media-soda',
    type: 'drink',
    source: 'PLACEHOLDER' as const,
    filename: '../../dishes/soda.jpg',
    alt: 'Gaseosa',
    priority: 'low',
    prompt: null,
    note: 'Asset del catálogo demo Bentoo reutilizado',
  },
  {
    id: 'media-agua',
    type: 'drink',
    source: 'PLACEHOLDER' as const,
    filename: '../../dishes/agua-mineral.jpg',
    alt: 'Agua mineral',
    priority: 'low',
    prompt: null,
    note: 'Asset del catálogo demo Bentoo reutilizado',
  },
];

function defaultOpeningHours(): Record<
  DayKey,
  Array<{ open: string; close: string }>
> {
  const weekday = [
    { open: '12:00', close: '15:00' },
    { open: '19:00', close: '23:00' },
  ];
  return {
    monday: weekday,
    tuesday: weekday,
    wednesday: weekday,
    thursday: weekday,
    friday: weekday,
    saturday: weekday,
    sunday: [],
  };
}

function ensureOpeningHours(
  raw: Record<string, unknown> | undefined,
): Record<DayKey, Array<{ open: string; close: string }>> {
  const base = defaultOpeningHours();
  if (!raw) return base;
  for (const day of DAY_KEYS) {
    const ranges = raw[day];
    if (Array.isArray(ranges)) {
      base[day] = ranges as Array<{ open: string; close: string }>;
    }
  }
  return base;
}

/** Gemini a veces devuelve cuisine: [] aunque el campo sea required. */
function normalizeCuisine(raw: unknown, category: unknown): string[] {
  const fromAi = Array.isArray(raw)
    ? raw
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];
  if (fromAi.length > 0) return fromAi;

  const fromCategory = typeof category === 'string' ? category.trim() : '';
  if (fromCategory) return [fromCategory];

  return ['Restaurante'];
}

function filePrefix(slug: string): string {
  const compact = slug.replace(/-/g, '').slice(0, 6);
  return compact || 'lead';
}

function buildMediaManifest(
  slug: string,
  businessName: string,
  products: Array<Record<string, unknown>>,
  cuisine: string[],
): ProspectBundle['media'] {
  const prefix = filePrefix(slug);
  const basePath = `/demo/photos/leads/${slug}/`;
  const cuisineHint = cuisine.join(', ') || 'restaurant food';

  const images: ProspectBundle['media']['images'] = [
    {
      id: 'media-logo',
      type: 'logo',
      source: 'GENERATED',
      filename: `${prefix}-logo.jpg`,
      alt: `Logo ${businessName}`,
      priority: 'high-replace',
      prompt: `Minimalist typographic logo "${businessName}", modern sans-serif, brand colors, clean restaurant identity`,
      replaceWith: 'Logo real del local (Instagram o Google)',
    },
    {
      id: 'media-hero',
      type: 'hero',
      source: 'GENERATED',
      filename: `${prefix}-hero.jpg`,
      alt: `Mesa con platos de ${businessName}`,
      priority: 'high',
      prompt: `Editorial restaurant table spread, ${cuisineHint}, soft window light, dark stone table, steam, appetizing`,
    },
    {
      id: 'media-interior',
      type: 'ambient',
      source: 'GENERATED',
      filename: `${prefix}-interior.jpg`,
      alt: `Interior de ${businessName}`,
      priority: 'medium-replace',
      prompt: `Modern ${cuisineHint} restaurant interior, warm lighting, cozy dining room`,
      replaceWith: 'Fotos reales de Instagram/Google Maps',
    },
  ];

  const refs = new Set<string>();

  for (const product of products) {
    let ref =
      typeof product.imageReference === 'string' ? product.imageReference : '';
    if (!ref) {
      ref = `media-${asOptionalString(product.id, 'dish').replace(/^p-/, '')}`;
      product.imageReference = ref;
    }
    refs.add(ref);
  }

  for (const ref of refs) {
    if (images.some((img) => img.id === ref)) continue;
    const dishName = asOptionalString(
      products.find((p) => p.imageReference === ref)?.name,
      ref,
    );
    images.push({
      id: ref,
      type: 'dish',
      source: 'GENERATED',
      filename: `${prefix}-${ref.replace(/^media-/, '')}.jpg`,
      alt: dishName,
      priority: 'medium',
      prompt: `Editorial food photo: ${dishName}, ${cuisineHint}, dark plate, soft natural light`,
    });
  }

  images.push(...DRINK_PLACEHOLDERS);

  return { basePath, images };
}

function buildSections(
  content: ProspectContentBlock,
  business: Record<string, unknown>,
  prospect: Record<string, unknown>,
  reservationsEnabled: boolean,
): ProspectBundle['sections'] {
  const hero = content.sections.hero ?? {};
  const featured = content.sections.featuredProducts ?? {};
  const about = content.sections.about ?? {};
  const testimonials = content.sections.testimonials ?? {};
  const faq = content.sections.faq ?? {};
  const contact = content.sections.contact ?? {};

  return {
    hero: {
      enabled: true,
      order: 1,
      anchor: 'hero',
      content: {
        headline:
          hero.headline ??
          `Bienvenidos a ${asOptionalString(prospect.businessName, 'nuestro local')}`,
        subheadline:
          hero.subheadline ??
          asOptionalString(business.description).slice(0, 120),
        trustSignals: Array.isArray(hero.trustSignals) ? hero.trustSignals : [],
        backgroundImage: 'media-hero',
      },
      ctas: [
        {
          id: 'cta-hero-primary',
          label: 'Pedir ahora',
          target: 'route:/order',
          hierarchy: 'primary',
        },
        {
          id: 'cta-hero-secondary',
          label: 'Ver la carta',
          target: 'anchor:menu',
          hierarchy: 'secondary',
        },
      ],
    },
    featuredProducts: {
      enabled: true,
      order: 2,
      anchor: 'featured',
      content: {
        title: featured.title ?? 'Los más pedidos',
        subtitle: featured.subtitle ?? 'Platos que no fallan',
        productIds: Array.isArray(featured.productIds)
          ? featured.productIds
          : [],
      },
      ctas: [
        {
          id: 'cta-featured',
          label: 'Ver toda la carta',
          target: 'anchor:menu',
          hierarchy: 'secondary',
        },
      ],
    },
    menu: {
      enabled: true,
      order: 3,
      anchor: 'menu',
      content: {
        title: 'La carta',
        subtitle: 'Elegí y pedí online',
        layout: 'grid',
        categoryDisplay: 'tabs',
        showSpicyLevel: true,
        showDietaryTags: true,
      },
      ctas: [
        {
          id: 'cta-menu-order',
          label: 'Pedir este plato',
          target: 'route:/order',
          hierarchy: 'primary',
        },
      ],
    },
    about: {
      enabled: true,
      order: 4,
      anchor: 'about',
      content: {
        title: about.title ?? 'Nuestra cocina',
        body:
          about.body ??
          asOptionalString(
            business.description,
            'Cocina de autor con ingredientes de calidad.',
          ),
        image: 'media-interior',
        highlights: Array.isArray(about.highlights) ? about.highlights : [],
      },
      ctas: [],
    },
    testimonials: {
      enabled: true,
      order: 5,
      anchor: 'testimonials',
      content: {
        title: testimonials.title ?? 'Lo que dicen quienes ya vinieron',
        items: Array.isArray(testimonials.items) ? testimonials.items : [],
      },
      ctas: [],
    },
    faq: {
      enabled: true,
      order: 6,
      anchor: 'faq',
      content: {
        title: faq.title ?? 'Preguntas frecuentes',
        items: Array.isArray(faq.items) ? faq.items : [],
      },
      ctas: [],
    },
    contact: {
      enabled: true,
      order: 7,
      anchor: 'contact',
      content: {
        title: contact.title ?? 'Dónde estamos',
        address:
          contact.address ??
          [prospect.address, prospect.neighborhood, prospect.city]
            .filter(Boolean)
            .join(', '),
        phone: contact.phone ?? null,
        hoursSummary: contact.hoursSummary ?? 'Consultá horarios en el local',
        notes: contact.notes ?? '',
        mapCoordinates: prospect.coordinates ?? null,
      },
      ctas: [
        {
          id: 'cta-contact-order',
          label: 'Pedir para retirar',
          target: 'route:/order',
          hierarchy: 'primary',
        },
      ],
    },
    footer: {
      enabled: true,
      order: 8,
      anchor: 'footer',
      content: {
        logo: 'media-logo',
        tagline: asOptionalString(business.description).slice(0, 80),
        showSocialLinks: true,
        showLegalLinks: true,
      },
      ctas: [],
    },
    gallery: {
      enabled: false,
      order: 0,
      anchor: 'gallery',
      reason:
        'Sin fotos reales suficientes; habilitar cuando se suban assets del local.',
      content: {},
      ctas: [],
    },
    reservation: {
      enabled: false,
      order: 0,
      anchor: 'reservation',
      reason: reservationsEnabled
        ? 'Reservas no configuradas en esta demo inicial.'
        : 'El local opera walk-in; empujar reservas restaría credibilidad.',
      content: {},
      ctas: [],
    },
  };
}

function buildBuilder(
  slug: string,
  palette: Record<string, string>,
  reservationsEnabled: boolean,
): ProspectBundle['builder'] {
  return {
    routes: [
      {
        path: '/',
        type: 'home',
        sections: [
          'hero',
          'featured',
          'menu',
          'about',
          'testimonials',
          'faq',
          'contact',
          'footer',
        ],
      },
      { path: '/order', type: 'ordering' },
      { path: '/cart', type: 'cart' },
      { path: '/checkout', type: 'checkout' },
    ],
    navigation: {
      items: [
        { label: 'Carta', target: 'anchor:menu' },
        { label: 'Nosotros', target: 'anchor:about' },
        { label: 'Contacto', target: 'anchor:contact' },
      ],
      ctaButton: { label: 'Pedir ahora', target: 'route:/order' },
      showOpenStatus: true,
    },
    homepageSectionOrder: [
      'hero',
      'featured',
      'menu',
      'about',
      'testimonials',
      'faq',
      'contact',
      'footer',
    ],
    menuConfiguration: {
      layout: 'grid',
      categoryDisplay: 'tabs',
      showImages: true,
      showSpicyLevel: true,
      showBadges: true,
      currency: 'ARS',
    },
    orderingConfiguration: {
      delivery: { enabled: true, estimatedTime: '30-45 min' },
      pickup: {
        enabled: true,
        estimatedTime: '15-20 min',
        highlight: 'Pedí anticipado y retirá sin fila',
      },
      dineIn: { enabled: true, reservationsEnabled: false },
      scheduledOrders: { enabled: true },
    },
    reservationConfiguration: {
      enabled: reservationsEnabled,
      reason: reservationsEnabled
        ? undefined
        : 'Local walk-in; ver sections.reservation.reason',
    },
    colorTokens: {
      primary: palette.primary ?? '#a31621',
      accent: palette.accent ?? '#b45309',
      background: palette.background ?? '#ffffff',
      surfaceMuted: palette.surfaceMuted ?? '#faf6f0',
      text: palette.text ?? '#1c1917',
      border: palette.border ?? '#e7e5e4',
    },
    typographyTokens: { heading: 'Inter/700', body: 'Inter/400', scale: 'md' },
    spacingTokens: { sectionY: 'lg', cardPadding: 'md', borderRadius: 'md' },
    ctaHierarchy: {
      primary: {
        style: 'solid',
        background: palette.primary ?? '#a31621',
        text: palette.primaryText ?? '#ffffff',
        defaultTarget: 'route:/order',
      },
      secondary: {
        style: 'outline',
        border: palette.primary ?? '#a31621',
        text: palette.primary ?? '#a31621',
        defaultTarget: 'anchor:menu',
      },
    },
    bentooImport: {
      demoSlug: slug,
      visibility: 'private-lead',
    },
  };
}

export function assembleProspectBundle(input: {
  leadId: string;
  businessBlock: ProspectBusinessBlock;
  menuBlock: ProspectMenuBlock;
  contentBlock: ProspectContentBlock;
}): ProspectBundle {
  const { businessBlock, menuBlock, contentBlock, leadId } = input;
  const businessName = asOptionalString(
    businessBlock.prospect.businessName,
    'Restaurante',
  );
  const slug = normalizeSlug(businessName);
  const prospectId = slug;
  const cuisine = normalizeCuisine(
    businessBlock.business.cuisine,
    businessBlock.business.category,
  );

  const palette = {
    primary: '#a31621',
    primaryText: '#ffffff',
    secondary: '#57534e',
    secondaryText: '#ffffff',
    accent: '#b45309',
    accentText: '#ffffff',
    background: '#ffffff',
    surfaceMuted: '#faf6f0',
    text: '#1c1917',
    textMuted: '#57534e',
    border: '#e7e5e4',
    footerBackground: '#1c1917',
    footerText: '#fafaf9',
    ...(businessBlock.branding?.colorPalette as Record<string, string>),
  };

  const services = (businessBlock.business.services ?? {}) as Record<
    string,
    boolean
  >;
  const reservationsEnabled = Boolean(services.reservations);

  const products = menuBlock.menu.products.map((p) => ({ ...p }));
  const media = buildMediaManifest(slug, businessName, products, cuisine);

  const openingHours = ensureOpeningHours(
    businessBlock.business.openingHours as Record<string, unknown>,
  );

  const sections = buildSections(
    contentBlock,
    businessBlock.business,
    businessBlock.prospect,
    reservationsEnabled,
  );

  const seoRaw = contentBlock.seo;
  const seoTitle = asOptionalString(
    seoRaw.title,
    `${businessName} | Pedí Online`,
  );
  const seoDesc = asOptionalString(
    seoRaw.metaDescription,
    asOptionalString(businessBlock.business.description).slice(0, 155),
  );

  const bundle: ProspectBundle = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    prospect: {
      id: prospectId,
      businessName,
      city: asOptionalString(businessBlock.prospect.city, 'Buenos Aires'),
      country: asOptionalString(businessBlock.prospect.country, 'AR'),
      neighborhood: businessBlock.prospect.neighborhood as string | undefined,
      address: businessBlock.prospect.address as string | undefined,
      coordinates: businessBlock.prospect
        .coordinates as ProspectBundle['prospect']['coordinates'],
      sources: (businessBlock.prospect.sources as string[]) ?? [],
      researchedUrls: (businessBlock.prospect.researchedUrls as string[]) ?? [],
      leadId,
    },
    business: {
      ...(businessBlock.business as unknown as ProspectBundle['business']),
      openingHours,
      cuisine,
    },
    branding: {
      logo: { mediaId: 'media-logo', status: 'generated-provisional' },
      favicon: { mediaId: 'media-logo', status: 'derive-from-logo' },
      colorPalette: palette,
      typography: {
        headingFont: 'Inter',
        bodyFont: 'Inter',
        baseSize: 'md',
        headingWeight: 700,
        bodyWeight: 400,
      },
      iconStyle: 'outline-minimal',
      photographyStyle:
        asOptionalString(businessBlock.branding?.photographyStyle) ||
        'Fotografía editorial de platos, luz natural suave.',
      toneOfVoice:
        asOptionalString(businessBlock.branding?.toneOfVoice) ||
        'Directo, cálido y concreto. Español rioplatense.',
      personality: Array.isArray(businessBlock.branding?.personality)
        ? (businessBlock.branding.personality as string[])
        : ['auténtico', 'casero'],
      visualKeywords: cuisine,
    },
    theme: DEFAULT_THEME as ProspectBundle['theme'],
    menu: {
      currency: menuBlock.menu.currency ?? 'ARS',
      pricesVerifiedAt: new Date().toISOString().slice(0, 10),
      priceSource: menuBlock.menu.priceSource ?? 'investigación IA',
      categories: menuBlock.menu
        .categories as unknown as ProspectBundle['menu']['categories'],
      products: products as unknown as ProspectBundle['menu']['products'],
    },
    sections,
    media,
    seo: {
      title: seoTitle,
      metaDescription: seoDesc,
      keywords: Array.isArray(seoRaw.keywords)
        ? (seoRaw.keywords as string[])
        : [businessName, ...cuisine],
      canonical: `/${slug}`,
      openGraph: {
        'og:title': seoTitle,
        'og:description': seoDesc,
        'og:type': 'restaurant.restaurant',
        'og:image': 'media-hero',
        'og:locale': 'es_AR',
      },
      twitter: {
        'twitter:card': 'summary_large_image',
        'twitter:title': seoTitle,
        'twitter:description': seoDesc,
        'twitter:image': 'media-hero',
      },
      localBusinessSchema: {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: businessName,
        servesCuisine: cuisine,
        priceRange: '$$',
      },
      faqSchema: Array.isArray(seoRaw.faqSchema)
        ? (seoRaw.faqSchema as Array<{ question: string; answer: string }>)
        : [],
    },
    social: businessBlock.social as ProspectBundle['social'],
    businessIntelligence: businessBlock.businessIntelligence,
    confidence: businessBlock.confidence as ProspectBundle['confidence'],
    editor: {
      editable: [
        'sections.*.content',
        'menu.products.*',
        'menu.categories.*',
        'branding.colorPalette',
        'seo.*',
      ],
      locked: ['schemaVersion', 'prospect.id'],
      recommended: [
        {
          field: 'media.media-logo',
          action: 'Reemplazar con logo real antes de presentar',
        },
      ],
      autoGenerated: [
        'branding.*',
        'theme.*',
        'sections.*',
        'seo.*',
        'media.*',
      ],
    },
    builder: buildBuilder(slug, palette, reservationsEnabled),
    metadata: {
      pipelineVersion: 'bentoo-leads-prospect-generator/1.0',
      schemaVersion: '1.0',
      language: 'es-AR',
      country: 'AR',
      currency: 'ARS',
      generatedBy: 'leads.generate_prospect_bundle',
      warnings: [
        'Imágenes GENERATED: reemplazar con fotos reales del local antes de presentar.',
        'Verificar precios y horarios con el dueño antes de la reunión comercial.',
      ],
    },
  };

  return bundle;
}
