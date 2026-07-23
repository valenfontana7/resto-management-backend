import type { DemoWorld } from '../types';

/** Showcase payload for DemoExample (frontend Restaurant + menu + operationalSnapshot). */
export function buildShowcasePayload(world: DemoWorld) {
  const {
    profile,
    categories,
    dishes,
    analytics,
    operationalSnapshot,
    reviews,
  } = world;

  const menu = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.name,
    order: cat.order,
    dishes: dishes
      .filter((d) => d.categoryId === cat.id)
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        price: d.price,
        salonPrice: d.price,
        image: d.image,
        isFeatured: d.featured,
        isAvailable: true,
        isAvailableInSalon: true,
        preparationTime: d.prepMinutes,
        tags: d.tags,
      })),
  }));

  const rating =
    reviews.length > 0
      ? Math.round(
          (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10,
        ) / 10
      : 4.6;

  return {
    id: profile.slug,
    name: profile.name,
    slug: profile.slug,
    type: profile.type,
    cuisine: profile.cuisine,
    location: {
      city: profile.city,
      neighborhood: profile.neighborhood,
      address: profile.address,
    },
    contact: {
      phone: profile.phone,
      email: profile.email,
    },
    social: {
      instagram: profile.instagram,
    },
    description: profile.description,
    founded: profile.foundedYear,
    capacity: profile.capacity,
    priceRange: profile.priceRange,
    rating,
    reviewCount: reviews.length,
    images: {
      logo: profile.media.logo,
      hero: profile.media.hero,
      interior: profile.media.interior,
      food: dishes
        .filter((d) => d.featured)
        .map((d) => d.image)
        .slice(0, 4),
    },
    hours: Object.fromEntries(
      Object.entries(profile.hours).map(([day, h]) => [
        day,
        h.closed ? 'Cerrado' : `${h.open} - ${h.close}`,
      ]),
    ),
    features: profile.aboutHighlights,
    stats: {
      monthlyOrders: analytics.monthlyOrders,
      avgOrderValue: analytics.avgOrderValue,
      customerRetention: 62,
      onlineOrdersPercentage: profile.slug === 'burger-lab' ? 58 : 34,
    },
    testimonials: reviews.slice(0, 5).map((r) => ({
      id: r.id,
      customerName: r.customerName,
      rating: r.rating,
      comment: r.comment,
      date: new Date(Date.now() - r.dayOffset * 86400000)
        .toISOString()
        .slice(0, 10),
      verified: true,
    })),
    about: {
      title: profile.aboutTitle,
      body: profile.aboutBody,
      highlights: profile.aboutHighlights,
    },
    featuredDishIds: dishes.filter((d) => d.featured).map((d) => d.id),
    seo: {
      title: `${profile.name} | Demo Bentoo`,
      description: profile.description,
      keywords: [...profile.cuisine, profile.neighborhood, 'demo'],
    },
    caseStudy: {
      challenge: profile.problems[0] ?? 'Operar con demanda irregular',
      solution: 'Canal propio + operación unificada en Bentoo',
      results: [
        {
          metric: 'Pedidos / mes',
          value: String(analytics.monthlyOrders),
          improvement: 'Historia coherente de operación',
        },
        {
          metric: 'Ticket promedio',
          value: `$${analytics.avgOrderValue}`,
          improvement: 'Alineado al concepto',
        },
      ],
    },
    menu,
    templateSlug: profile.slug,
    businessRules: {
      demoShowcase: true,
      demoFlagship: true,
    },
    operationalSnapshot,
  };
}
