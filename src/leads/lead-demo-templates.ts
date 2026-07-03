import type { LeadDemoTemplateSlug } from './leads-ai.helpers';

const BASE_HOURS = {
  monday: '09:00-22:00',
  tuesday: '09:00-22:00',
  wednesday: '09:00-22:00',
  thursday: '09:00-22:00',
  friday: '09:00-23:00',
  saturday: '10:00-23:00',
  sunday: '10:00-22:00',
};

const BASE_STATS = {
  monthlyOrders: 1800,
  avgOrderValue: 28,
  customerRetention: 78,
  onlineOrdersPercentage: 62,
};

function imagesFor(templateSlug: LeadDemoTemplateSlug) {
  return {
    logo: `/demo/restaurants/${templateSlug}/logo.svg`,
    hero: `/demo/restaurants/${templateSlug}/hero.svg`,
    interior: ['/demo/restaurants/shared/interior-warm.svg'],
    food: ['/demo/food/brunch-board.svg'],
  };
}

const TEMPLATES: Record<LeadDemoTemplateSlug, Record<string, unknown>> = {
  'cafe-central': {
    type: 'cafe',
    cuisine: ['Café', 'Desayunos', 'Brunch'],
    location: {
      city: 'Buenos Aires',
      neighborhood: 'Palermo',
      address: 'Demo comercial Bentoo',
    },
    contact: { phone: '', email: '' },
    social: {},
    description:
      'Cafetería con menú digital, pedidos online y reservas integradas en Bentoo.',
    founded: 2015,
    capacity: 70,
    priceRange: '$$',
    rating: 4.7,
    reviewCount: 420,
    images: imagesFor('cafe-central'),
    hours: BASE_HOURS,
    features: ['Menú digital', 'Pedidos online', 'Reservas', 'Delivery'],
    stats: BASE_STATS,
    testimonials: [],
  },
  'pizza-artesanal': {
    type: 'restaurant',
    cuisine: ['Pizza', 'Italiana'],
    location: {
      city: 'Buenos Aires',
      neighborhood: 'Villa Crespo',
      address: 'Demo comercial Bentoo',
    },
    contact: { phone: '', email: '' },
    social: {},
    description:
      'Pizzería con carta digital, pedidos y delivery propio con Bentoo.',
    founded: 2016,
    capacity: 90,
    priceRange: '$$',
    rating: 4.8,
    reviewCount: 680,
    images: imagesFor('pizza-artesanal'),
    hours: BASE_HOURS,
    features: ['Menú digital', 'Delivery', 'Take away'],
    stats: BASE_STATS,
    testimonials: [],
  },
  'la-parrilla': {
    type: 'restaurant',
    cuisine: ['Parrilla', 'Argentina'],
    location: {
      city: 'Buenos Aires',
      neighborhood: 'Palermo',
      address: 'Demo comercial Bentoo',
    },
    contact: { phone: '', email: '' },
    social: {},
    description: 'Parrilla con reservas, carta y operación digital con Bentoo.',
    founded: 1998,
    capacity: 110,
    priceRange: '$$$',
    rating: 4.6,
    reviewCount: 950,
    images: imagesFor('la-parrilla'),
    hours: BASE_HOURS,
    features: ['Reservas', 'Menú digital', 'Salón integrado'],
    stats: BASE_STATS,
    testimonials: [],
  },
  'burger-lab': {
    type: 'restaurant',
    cuisine: ['Hamburguesas', 'Americana'],
    location: {
      city: 'Córdoba',
      neighborhood: 'Centro',
      address: 'Demo comercial Bentoo',
    },
    contact: { phone: '', email: '' },
    social: {},
    description:
      'Burger shop con pedidos online y gestión unificada en Bentoo.',
    founded: 2019,
    capacity: 60,
    priceRange: '$$',
    rating: 4.7,
    reviewCount: 510,
    images: imagesFor('burger-lab'),
    hours: BASE_HOURS,
    features: ['Delivery', 'Menú digital', 'Take away'],
    stats: BASE_STATS,
    testimonials: [],
  },
  'sushi-express': {
    type: 'restaurant',
    cuisine: ['Sushi', 'Japonesa'],
    location: {
      city: 'Buenos Aires',
      neighborhood: 'Belgrano',
      address: 'Demo comercial Bentoo',
    },
    contact: { phone: '', email: '' },
    social: {},
    description: 'Sushi bar con pedidos digitales y delivery con Bentoo.',
    founded: 2017,
    capacity: 55,
    priceRange: '$$$',
    rating: 4.5,
    reviewCount: 390,
    images: imagesFor('sushi-express'),
    hours: BASE_HOURS,
    features: ['Delivery', 'Menú digital', 'Take away'],
    stats: BASE_STATS,
    testimonials: [],
  },
};

export function getLeadDemoTemplatePayload(
  templateSlug: LeadDemoTemplateSlug,
): Record<string, unknown> {
  return { ...TEMPLATES[templateSlug] };
}
