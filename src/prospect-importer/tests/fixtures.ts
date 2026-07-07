import { ProspectBundle } from '../types';

/** Bundle mínimo válido para tests. Cada test lo muta para su caso. */
export function buildTestBundle(
  overrides: Partial<ProspectBundle> = {},
): ProspectBundle {
  const bundle: ProspectBundle = {
    schemaVersion: '1.0',
    generatedAt: '2026-07-06T12:00:00-03:00',
    prospect: {
      id: 'test-resto',
      businessName: 'Test Resto',
      city: 'Buenos Aires',
      country: 'AR',
      neighborhood: 'Palermo',
      address: 'Calle Falsa 123',
      sources: ['instagram'],
      researchedUrls: ['https://instagram.com/testresto'],
    },
    business: {
      description: 'Un restaurante de prueba con cocina honesta.',
      cuisine: ['Pizza'],
      category: 'restaurant',
      openingHours: {
        monday: [{ open: '12:00', close: '15:00' }],
        tuesday: [{ open: '12:00', close: '15:00' }],
        wednesday: [{ open: '12:00', close: '15:00' }],
        thursday: [{ open: '12:00', close: '15:00' }],
        friday: [
          { open: '12:00', close: '15:00' },
          { open: '19:00', close: '23:30' },
        ],
        saturday: [{ open: '19:00', close: '23:30' }],
        sunday: [],
      },
      services: {
        dineIn: true,
        delivery: true,
        takeAway: true,
        reservations: false,
      },
      averageTicket: { value: 15000, currency: 'ARS' },
      foundedYear: 2015,
      capacity: 40,
      rating: 4.5,
      reviewCount: 320,
    },
    branding: {
      logo: { mediaId: 'media-logo' },
      colorPalette: {
        primary: '#c2410c',
        background: '#ffffff',
        text: '#0f172a',
      },
      typography: { headingFont: 'Inter', bodyFont: 'Inter' },
    },
    theme: {
      borderRadius: 'md',
      shadows: 'soft',
      menuLayout: 'grid',
      categoryDisplay: 'tabs',
      maxWidth: 'xl',
      heroOverlay: { color: '#000000', opacity: 50 },
    },
    menu: {
      currency: 'ARS',
      categories: [
        {
          id: 'cat-pizzas',
          name: 'Pizzas',
          description: 'A la piedra',
          order: 1,
        },
        { id: 'cat-bebidas', name: 'Bebidas', description: '', order: 2 },
      ],
      products: [
        {
          id: 'p-muzza',
          name: 'Muzzarella',
          description: 'Clásica con aceitunas',
          price: 12000,
          category: 'cat-pizzas',
          imageReference: 'media-pizza',
          badges: ['best-seller'],
          popularity: 0.95,
        },
        {
          id: 'p-napo',
          name: 'Napolitana',
          description: 'Tomate y ajo',
          price: 14000,
          category: 'cat-pizzas',
          imageReference: 'media-pizza',
        },
        {
          id: 'p-agua',
          name: 'Agua',
          description: 'Agua mineral 500ml',
          price: 3000,
          category: 'cat-bebidas',
          imageReference: 'media-agua',
        },
      ],
    },
    sections: {
      hero: {
        enabled: true,
        order: 1,
        anchor: 'hero',
        content: {
          headline: 'La mejor pizza',
          subheadline: 'Hecha a mano',
          backgroundImage: 'media-hero',
        },
        ctas: [
          {
            id: 'cta-hero',
            label: 'Pedir',
            target: 'route:/order',
            hierarchy: 'primary',
          },
          {
            id: 'cta-hero-2',
            label: 'Ver carta',
            target: 'anchor:menu',
            hierarchy: 'secondary',
          },
        ],
      },
      featuredProducts: {
        enabled: true,
        order: 2,
        anchor: 'featured',
        content: { title: 'Destacados', productIds: ['p-muzza'] },
        ctas: [],
      },
      menu: {
        enabled: true,
        order: 3,
        anchor: 'menu',
        content: { title: 'La carta' },
        ctas: [],
      },
      testimonials: {
        enabled: true,
        order: 4,
        anchor: 'testimonials',
        content: {
          title: 'Opiniones',
          items: [
            {
              id: 't-1',
              author: 'Ana',
              rating: 5,
              text: 'Excelente',
              date: '2026-01-01',
            },
          ],
        },
        ctas: [],
      },
      contact: {
        enabled: true,
        order: 5,
        anchor: 'contact',
        content: { title: 'Contacto', address: 'Calle Falsa 123' },
        ctas: [],
      },
      footer: {
        enabled: true,
        order: 6,
        anchor: 'footer',
        content: { logo: 'media-logo' },
        ctas: [],
      },
      reservation: {
        enabled: false,
        order: 0,
        anchor: 'reservation',
        reason: 'No opera con reservas',
        content: {},
        ctas: [],
      },
    },
    media: {
      basePath: '/demo/photos/leads/test-resto/',
      images: [
        {
          id: 'media-logo',
          type: 'logo',
          source: 'GENERATED',
          filename: 'logo.jpg',
          alt: 'Logo',
          priority: 'high-replace',
          prompt: 'logo prompt',
        },
        {
          id: 'media-hero',
          type: 'hero',
          source: 'GENERATED',
          filename: 'hero.jpg',
          alt: 'Hero',
          priority: 'high',
          prompt: 'hero prompt',
        },
        {
          id: 'media-pizza',
          type: 'dish',
          source: 'GENERATED',
          filename: 'pizza.jpg',
          alt: 'Pizza',
          priority: 'high',
          prompt: 'pizza prompt',
        },
        {
          id: 'media-agua',
          type: 'drink',
          source: 'PLACEHOLDER',
          filename: '../../dishes/agua.jpg',
          alt: 'Agua',
          priority: 'low',
          prompt: null,
        },
      ],
    },
    seo: {
      title: 'Test Resto · Pizzería en Palermo',
      metaDescription: 'La mejor pizza de Palermo.',
      keywords: ['pizzeria palermo'],
      openGraph: { 'og:image': 'media-hero' },
      twitter: { 'twitter:image': 'media-hero' },
    },
    social: {
      instagram: {
        value: 'https://instagram.com/testresto',
        confidence: 1,
        source: ['input'],
      },
      phone: { value: '+54 11 5555-5555', confidence: 0.9, source: ['web'] },
      email: { value: null, confidence: 0, source: [], status: 'not-found' },
    },
    builder: {
      routes: [
        { path: '/', type: 'home' },
        { path: '/order', type: 'ordering' },
      ],
      navigation: {
        items: [
          { label: 'Carta', target: 'anchor:menu' },
          { label: 'Contacto', target: 'anchor:contact' },
        ],
        ctaButton: { label: 'Pedir', target: 'route:/order' },
        showOpenStatus: true,
      },
      homepageSectionOrder: [
        'hero',
        'featured',
        'menu',
        'testimonials',
        'contact',
        'footer',
      ],
      colorTokens: { primary: '#c2410c' },
      bentooImport: { demoSlug: 'test-resto', visibility: 'private-lead' },
    },
  };

  return { ...bundle, ...overrides };
}

// ============================================================================
// Prisma mock
// ============================================================================

export interface PrismaMockState {
  rows: Map<
    string,
    { id: string; slug: string; sortOrder: number; data: unknown }
  >;
  failOn?: 'create' | 'update' | 'findUnique';
  calls: string[];
}

/** Mock mínimo de PrismaClient compatible con el importer ($transaction + demoExample). */
export function createPrismaMock(state?: Partial<PrismaMockState>) {
  const internal: PrismaMockState = {
    rows: state?.rows ?? new Map(),
    failOn: state?.failOn,
    calls: state?.calls ?? [],
  };

  const demoExample = {
    findUnique: async ({
      where,
    }: {
      where: { slug?: string; id?: string };
    }) => {
      internal.calls.push('findUnique');
      if (internal.failOn === 'findUnique') throw new Error('findUnique falló');
      const row = where.slug
        ? internal.rows.get(where.slug)
        : [...internal.rows.values()].find((r) => r.id === where.id);
      return row
        ? { id: row.id, sortOrder: row.sortOrder, slug: row.slug }
        : null;
    },
    create: async ({ data }: { data: { slug: string; sortOrder: number } }) => {
      internal.calls.push('create');
      if (internal.failOn === 'create') throw new Error('create falló');
      const row = {
        id: `db-${internal.rows.size + 1}`,
        slug: data.slug,
        sortOrder: data.sortOrder,
        data,
      };
      internal.rows.set(data.slug, row);
      return { id: row.id };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { sortOrder: number };
    }) => {
      internal.calls.push('update');
      if (internal.failOn === 'update') throw new Error('update falló');
      const row = [...internal.rows.values()].find((r) => r.id === where.id);
      if (!row) throw new Error('registro inexistente');
      row.data = data;
      row.sortOrder = data.sortOrder;
      return { id: row.id };
    },
  };

  const prisma = {
    demoExample,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      internal.calls.push('$transaction');
      // Simula rollback: si el trabajo lanza, ninguna mutación previa del
      // callback debe quedar visible. Clonamos el estado y solo commiteamos al éxito.
      const snapshot = new Map(internal.rows);
      try {
        return await fn({ demoExample });
      } catch (error) {
        internal.rows.clear();
        for (const [key, value] of snapshot) internal.rows.set(key, value);
        throw error;
      }
    },
  };

  return { prisma: prisma as never, state: internal };
}
