/**
 * Carga datos de demo para Parrilla Buenos Aires (local).
 *
 * Uso:
 *   npm run seed:parrilla
 *   npm run seed:parrilla:fresh   # borra datos operativos y vuelve a cargar
 */
import 'dotenv/config';
import * as crypto from 'crypto';
import {
  BusinessEventImportance,
  BusinessEventReplayPolicy,
  BusinessMemoryCategory,
  BusinessMemoryStatus,
  DeliveryStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ReservationStatus,
  TableStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const RESTAURANT_SLUG = 'la-parrilla-de-buenos-aires';
const DEMO_TAG = 'seed-pba-demo';

/** URLs estables (mismas que scripts/sync-demo-photos.mjs y mock demo). */
const PBA_MEDIA = {
  logo: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=400&fit=crop&q=85',
  cover:
    'https://images.pexels.com/photos/2233348/pexels-photo-2233348.jpeg?auto=compress&cs=tinysrgb&w=1200&h=600&fit=crop',
  hero: 'https://images.pexels.com/photos/2233348/pexels-photo-2233348.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop',
  interior: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop&q=85',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop&q=85',
  ],
  categories: {
    Entradas:
      'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&h=600&fit=crop&q=85',
    Asados:
      'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=600&fit=crop&q=85',
    Achuras:
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=600&fit=crop&q=85',
    Guarniciones:
      'https://images.pexels.com/photos/1893556/pexels-photo-1893556.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    Milanesas:
      'https://images.unsplash.com/photo-1598514984248-406728ad72fd?w=800&h=600&fit=crop&q=85',
    Bebidas:
      'https://images.pexels.com/photos/1126728/pexels-photo-1126728.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    Postres:
      'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&h=600&fit=crop&q=85',
  },
  dishes: {
    'Provoleta a la parrilla':
      'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&h=600&fit=crop&q=85',
    'Choripán artesanal':
      'https://images.unsplash.com/photo-1606756790650-2f9c818261a8?w=800&h=600&fit=crop&q=85',
    'Bife de chorizo (400g)':
      'https://images.unsplash.com/photo-1558030006-450675393462?w=800&h=600&fit=crop&q=85',
    'Entraña (350g)':
      'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&h=600&fit=crop&q=85',
    'Tira de asado (500g)':
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&h=600&fit=crop&q=85',
    'Morcilla vasca':
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800&h=600&fit=crop&q=85',
    'Chinchulines crocantes':
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&h=600&fit=crop&q=85',
    'Papas rústicas':
      'https://images.pexels.com/photos/1893556/pexels-photo-1893556.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'Ensalada mixta':
      'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=800&h=600&fit=crop&q=85',
    'Milanesa napolitana':
      'https://images.unsplash.com/photo-1598514984248-406728ad72fd?w=800&h=600&fit=crop&q=85',
    'Malbec copa':
      'https://images.pexels.com/photos/1126728/pexels-photo-1126728.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'Flan casero con dulce de leche':
      'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&h=600&fit=crop&q=85',
  },
} as const;

/** Polígono simple Palermo — requerido para go-live “zona con mapa”. */
const PALERMO_ZONE_POLYGON = {
  rings: [
    [
      { lat: -34.572, lng: -58.435 },
      { lat: -34.572, lng: -58.405 },
      { lat: -34.598, lng: -58.405 },
      { lat: -34.598, lng: -58.435 },
      { lat: -34.572, lng: -58.435 },
    ],
  ],
  source: 'manual',
  updatedAt: new Date().toISOString(),
} as const;

type ReviewSeed = {
  dishName?: string;
  customerName: string;
  customerEmail?: string;
  rating: number;
  comment: string;
  daysAgo: number;
  approved?: boolean;
};

const REVIEW_SEEDS: ReviewSeed[] = [
  {
    dishName: 'Bife de chorizo (400g)',
    customerName: 'Sofía López',
    customerEmail: 'sofia@example.com',
    rating: 5,
    comment:
      'El mejor bife del barrio. Jugoso, bien marcado y con chimichurri de la casa.',
    daysAgo: 12,
  },
  {
    dishName: 'Bife de chorizo (400g)',
    customerName: 'Martín Acosta',
    customerEmail: 'martin.acosta@example.com',
    rating: 5,
    comment: 'Pedimos dos porciones para compartir. Impecable como siempre.',
    daysAgo: 8,
  },
  {
    dishName: 'Bife de chorizo (400g)',
    customerName: 'Lucía Fernández',
    rating: 4,
    comment:
      'Muy bueno, solo que el punto vino un poco más hecho de lo pedido.',
    daysAgo: 3,
  },
  {
    dishName: 'Entraña (350g)',
    customerName: 'Diego Romero',
    customerEmail: 'diego@example.com',
    rating: 5,
    comment: 'Entraña tierna y las papas vienen perfectas.',
    daysAgo: 10,
  },
  {
    dishName: 'Entraña (350g)',
    customerName: 'Carolina Méndez',
    rating: 4,
    comment: 'Excelente sabor. Porción generosa.',
    daysAgo: 5,
  },
  {
    dishName: 'Tira de asado (500g)',
    customerName: 'Pablo Núñez',
    customerEmail: 'pablo@example.com',
    rating: 5,
    comment: 'Se deshace en la boca. Ideal para compartir en mesa.',
    daysAgo: 14,
  },
  {
    dishName: 'Tira de asado (500g)',
    customerName: 'Ana Belén Ruiz',
    rating: 4,
    comment: 'Muy rica, tardó un poco más que otros platos pero valió la pena.',
    daysAgo: 6,
  },
  {
    dishName: 'Provoleta a la parrilla',
    customerName: 'Julieta Sosa',
    rating: 5,
    comment:
      'Entrada obligada. El queso queda dorado y el orégano le da un toque único.',
    daysAgo: 9,
  },
  {
    dishName: 'Provoleta a la parrilla',
    customerName: 'Federico Luna',
    rating: 4,
    comment: 'Muy rica para arrancar. La porción alcanza para dos.',
    daysAgo: 2,
  },
  {
    dishName: 'Choripán artesanal',
    customerName: 'Pablo Núñez',
    customerEmail: 'pablo@example.com',
    rating: 3,
    comment: 'Muy bueno pero hoy tardaron en traerlo.',
    daysAgo: 1,
  },
  {
    dishName: 'Choripán artesanal',
    customerName: 'María González',
    rating: 4,
    comment: 'Chorizo casero con mucho sabor. Pan de campo excelente.',
    daysAgo: 7,
  },
  {
    dishName: 'Milanesa napolitana',
    customerName: 'Tomás Herrera',
    rating: 5,
    comment:
      'Crujiente por fuera, jugosa por dentro. La napolitana está muy bien lograda.',
    daysAgo: 11,
  },
  {
    dishName: 'Milanesa napolitana',
    customerName: 'Valentina Prieto',
    rating: 4,
    comment: 'Gran opción si no querés parrilla. Porción abundante.',
    daysAgo: 4,
  },
  {
    dishName: 'Papas rústicas',
    customerName: 'Nicolás Vega',
    rating: 5,
    comment: 'Crocantes y bien condimentadas. Van con todo.',
    daysAgo: 15,
  },
  {
    dishName: 'Ensalada mixta',
    customerName: 'Camila Ortiz',
    rating: 4,
    comment: 'Fresca y liviana. Buen balance con los cortes pesados.',
    daysAgo: 6,
  },
  {
    dishName: 'Malbec copa',
    customerName: 'Ricardo Molina',
    rating: 5,
    comment: 'Malbec suave que acompaña perfecto el asado.',
    daysAgo: 13,
  },
  {
    dishName: 'Flan casero con dulce de leche',
    customerName: 'Elena Díaz',
    rating: 5,
    comment: 'Postre casero de verdad. El dulce de leche es tremendo.',
    daysAgo: 5,
  },
  {
    dishName: 'Morcilla vasca',
    customerName: 'Gustavo Peralta',
    rating: 4,
    comment: 'La cebolla caramelizada le suma mucho. Muy sabrosa.',
    daysAgo: 8,
  },
  {
    dishName: 'Chinchulines crocantes',
    customerName: 'Hernán Suárez',
    rating: 4,
    comment: 'Bien crocantes. Para los que saben.',
    daysAgo: 9,
  },
  {
    customerName: 'María García',
    customerEmail: 'maria.garcia@example.com',
    rating: 5,
    comment:
      'Celebramos un cumpleaños y la atención fue excelente de punta a punta.',
    daysAgo: 18,
  },
  {
    customerName: 'Carlos Rodríguez',
    rating: 5,
    comment: 'La mejor parrilla del barrio. Volveremos seguro.',
    daysAgo: 20,
  },
  {
    customerName: 'Cliente anónimo',
    rating: 2,
    comment: 'Demora larga un sábado a la noche. La comida llegó fría.',
    daysAgo: 2,
    approved: false,
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const fresh = process.argv.includes('--fresh');

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number, hour = 13, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type DemoCustomer = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
};

function todayBusinessDate(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12),
  );
}

/** Alineado con GoLiveReadinessService.todayBusinessDate() */
function businessDateOnly(): Date {
  return todayBusinessDate();
}

function encryptMpToken(plaintext: string): string {
  const raw = process.env.MP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      'MP_TOKEN_ENCRYPTION_KEY es necesario para sembrar Mercado Pago demo',
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'MP_TOKEN_ENCRYPTION_KEY debe ser 32 bytes (hex 64 chars o base64)',
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

async function resolveRestaurantOwnerUserId(
  restaurantId: string,
): Promise<string | null> {
  const membership = await prisma.restaurantMembership.findFirst({
    where: { restaurantId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { userId: true },
  });
  if (membership?.userId) return membership.userId;

  const user = await prisma.user.findFirst({
    where: { restaurantId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function seedMercadoPagoCredential(restaurantId: string) {
  if (!process.env.MP_TOKEN_ENCRYPTION_KEY) {
    console.warn(
      '⚠️  MP_TOKEN_ENCRYPTION_KEY ausente — el paso "Cobro online" quedará incompleto',
    );
    return;
  }

  const ciphertext = encryptMpToken('TEST-demo-parrilla-buenos-aires-seed');
  await prisma.mercadoPagoCredential.upsert({
    where: { restaurantId },
    create: {
      restaurantId,
      accessTokenCiphertext: ciphertext,
      accessTokenLast4: 'DEMO',
      isSandbox: true,
      connectedVia: 'manual',
      livemode: false,
      mpUserId: 'demo-pba-owner',
      publishableKey: 'TEST-demo-publishable-key',
    },
    update: {
      accessTokenCiphertext: ciphertext,
      accessTokenLast4: 'DEMO',
      isSandbox: true,
      connectedVia: 'manual',
      livemode: false,
      publishableKey: 'TEST-demo-publishable-key',
    },
  });
}

async function wipeFloorData(restaurantId: string) {
  await prisma.tableSession.updateMany({
    where: { restaurantId },
    data: { orderId: null, cashRegisterSessionId: null },
  });
  await prisma.order.updateMany({
    where: { restaurantId },
    data: { tableSessionId: null },
  });

  await prisma.fiscalDocument.updateMany({
    where: { restaurantId },
    data: { relatedFiscalDocumentId: null },
  });
  await prisma.fiscalDocument.deleteMany({ where: { restaurantId } });

  await prisma.cashMovement.deleteMany({
    where: { cashSession: { restaurantId } },
  });

  // Cascades TableSessionItem + modifiers; must run before dish.deleteMany.
  await prisma.tableSession.deleteMany({ where: { restaurantId } });
  await prisma.cashRegisterSession.deleteMany({ where: { restaurantId } });
}

async function wipeOperationalData(restaurantId: string) {
  console.log('🧹 Limpiando datos operativos previos...');

  await prisma.table.updateMany({
    where: { restaurantId },
    data: {
      currentOrderId: null,
      currentReservationId: null,
      currentSessionId: null,
      status: TableStatus.AVAILABLE,
      customerName: null,
      occupiedSince: null,
    },
  });

  await wipeFloorData(restaurantId);

  const loyaltyAccounts = await prisma.loyaltyAccount.findMany({
    where: { restaurantId },
    select: { id: true },
  });
  if (loyaltyAccounts.length > 0) {
    await prisma.loyaltyTransaction.deleteMany({
      where: { accountId: { in: loyaltyAccounts.map((a) => a.id) } },
    });
  }

  await prisma.loyaltyAccount.deleteMany({ where: { restaurantId } });
  await prisma.winBackEmailLog.deleteMany({ where: { restaurantId } });
  await prisma.businessEvent.deleteMany({ where: { restaurantId } });
  await prisma.businessMemory.deleteMany({ where: { restaurantId } });
  await prisma.businessHealthSnapshot.deleteMany({ where: { restaurantId } });
  await prisma.dailyOperation.deleteMany({ where: { restaurantId } });
  await prisma.review.deleteMany({ where: { restaurantId } });
  await prisma.order.deleteMany({ where: { restaurantId } });
  await prisma.checkoutSession.deleteMany({ where: { restaurantId } });
  await prisma.reservation.deleteMany({ where: { restaurantId } });
  await prisma.dishRecipeLine.deleteMany({
    where: { dish: { restaurantId } },
  });
  await prisma.dish.deleteMany({ where: { restaurantId } });
  await prisma.inventoryItem.deleteMany({ where: { restaurantId } });
  await prisma.deliveryDriver.deleteMany({ where: { restaurantId } });
  await prisma.deliveryZone.deleteMany({ where: { restaurantId } });
  await prisma.table.deleteMany({ where: { restaurantId } });
  await prisma.tableArea.deleteMany({ where: { restaurantId } });
  await prisma.restaurantCustomerProfile.deleteMany({
    where: { restaurantId },
  });
  await prisma.category.deleteMany({ where: { restaurantId } });
}

async function ensureRestaurantConfig(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      businessRules: true,
      features: true,
      branding: true,
      phone: true,
      address: true,
      city: true,
      country: true,
      postalCode: true,
      email: true,
    },
  });
  if (!restaurant) throw new Error('Restaurante no encontrado');

  const rules = (restaurant.businessRules ?? {}) as Record<string, unknown>;
  const features = (restaurant.features ?? {}) as Record<string, unknown>;
  const existingPayment = (rules.payment ?? {}) as Record<string, unknown>;

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      onboardingIncomplete: false,
      isPublished: true,
      isIndexable: true,
      logo: PBA_MEDIA.logo,
      coverImage: PBA_MEDIA.cover,
      phone: restaurant.phone?.trim() || '+54 11 4567-8900',
      address: restaurant.address?.trim() || 'Av. Juan B. Justo 1234',
      city: restaurant.city?.trim() || 'Buenos Aires',
      country: restaurant.country?.trim() || 'Argentina',
      postalCode: restaurant.postalCode?.trim() || 'C1414',
      email: restaurant.email?.trim() || 'hola@parrilla-buenos-aires.com.ar',
      website: 'https://parrilla-buenos-aires.bentoo.com.ar',
      description:
        'Parrilla porteña de barrio con asado, achuras y vinos. Ideal para probar operación, negocio y atención en Bentoo.',
      socialMedia: {
        instagram: '@parrilla_buenos_aires',
        facebook: 'parrillabuenosaires',
        whatsapp: '+54 11 4567-8900',
      },
      branding: {
        theme: {
          colors: {
            primary: '#c2410c',
            primaryText: '#ffffff',
            secondary: '#9a3412',
            secondaryText: '#ffffff',
            accent: '#d97706',
            accentText: '#0f172a',
            text: '#0f172a',
            background: '#ffffff',
          },
          typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 'md',
          },
          spacing: { borderRadius: 'md', cardShadow: true },
        },
        assets: {
          logo: PBA_MEDIA.logo,
          coverImage: PBA_MEDIA.cover,
          bannerImage: PBA_MEDIA.hero,
          gallery: PBA_MEDIA.interior,
        },
        layout: {
          menuStyle: 'list',
          categoryDisplay: 'tabs',
          showHeroSection: true,
          showStats: true,
        },
        sections: {
          hero: {
            title: 'Parrilla Buenos Aires',
            subtitle: 'Asado de verdad, en tu barrio',
            backgroundColor: '#ffffff',
            titleColor: '#0f172a',
            descriptionColor: '#334155',
          },
          footer: {
            backgroundColor: '#0f172a',
            textColor: '#ffffff',
          },
        },
      },
      features: {
        menu: true,
        orders: true,
        onlineOrdering: true,
        takeaway: true,
        delivery: true,
        reservations: true,
        loyalty: true,
        reviews: true,
        socialMedia: true,
        ...features,
      },
      businessRules: {
        ...rules,
        productIntent: 'both',
        dineIn: { enabled: true, reservationsEnabled: true },
        pickup: { enabled: true },
        delivery: { enabled: true },
        payment: {
          requirePrepayment: false,
          acceptTips: true,
          ...existingPayment,
          methods: ['digital-wallet', 'cash'],
        },
        orders: {
          minOrderAmount: 8000,
          orderLeadTime: 35,
          allowScheduledOrders: true,
          ...(rules.orders as object),
        },
        inventory: {
          autoDeductOnSale: true,
          autoDisableDishesWhenOutOfStock: true,
          ...(rules.inventory as object),
        },
        growth: {
          winBackEnabled: true,
          inactiveDaysThreshold: 30,
          ...(rules.growth as object),
        },
      },
    },
  });

  await seedMercadoPagoCredential(restaurantId);
}

type DishSeed = {
  category: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  prepMinutes: number;
  tags?: string[];
  featured?: boolean;
  unavailable?: boolean;
};

const DISH_CATALOG: DishSeed[] = [
  {
    category: 'Entradas',
    name: 'Provoleta a la parrilla',
    description: 'Con orégano y chimichurri.',
    price: 8900,
    costPrice: 3200,
    prepMinutes: 12,
    tags: ['entrada', 'queso'],
  },
  {
    category: 'Entradas',
    name: 'Choripán artesanal',
    description: 'Chorizo casero, pan de campo y chimichurri.',
    price: 6500,
    costPrice: 2100,
    prepMinutes: 10,
    tags: ['entrada', 'achura'],
  },
  {
    category: 'Asados',
    name: 'Bife de chorizo (400g)',
    description: 'Corte premium a la parrilla.',
    price: 18900,
    costPrice: 9800,
    prepMinutes: 25,
    featured: true,
    tags: ['parrilla', 'carne'],
  },
  {
    category: 'Asados',
    name: 'Entraña (350g)',
    description: 'Jugosa, con papas fritas.',
    price: 16500,
    costPrice: 8200,
    prepMinutes: 22,
    tags: ['parrilla', 'carne'],
  },
  {
    category: 'Asados',
    name: 'Tira de asado (500g)',
    description: 'Cocción lenta, punto justo.',
    price: 14200,
    costPrice: 6100,
    prepMinutes: 28,
    tags: ['parrilla', 'carne'],
  },
  {
    category: 'Achuras',
    name: 'Morcilla vasca',
    description: 'Con cebolla caramelizada.',
    price: 7200,
    costPrice: 2400,
    prepMinutes: 15,
    tags: ['achura'],
  },
  {
    category: 'Achuras',
    name: 'Chinchulines crocantes',
    description: 'Porción para compartir.',
    price: 7800,
    costPrice: 2600,
    prepMinutes: 18,
    tags: ['achura'],
  },
  {
    category: 'Guarniciones',
    name: 'Papas rústicas',
    description: 'Con ají molido.',
    price: 5200,
    costPrice: 1200,
    prepMinutes: 12,
    tags: ['guarnicion'],
  },
  {
    category: 'Guarniciones',
    name: 'Ensalada mixta',
    description: 'Lechuga, tomate, zanahoria.',
    price: 4800,
    costPrice: 1100,
    prepMinutes: 8,
    tags: ['guarnicion', 'ensalada'],
  },
  {
    category: 'Milanesas',
    name: 'Milanesa napolitana',
    description: 'Con jamón, salsa y mozzarella.',
    price: 11800,
    costPrice: 4300,
    prepMinutes: 20,
    tags: ['milanesa'],
  },
  {
    category: 'Bebidas',
    name: 'Malbec copa',
    description: 'Selección de la casa.',
    price: 4500,
    costPrice: 1400,
    prepMinutes: 2,
    tags: ['bebida', 'vino'],
  },
  {
    category: 'Postres',
    name: 'Flan casero con dulce de leche',
    description: 'Receta de la abuela.',
    price: 5600,
    costPrice: 1500,
    prepMinutes: 5,
    tags: ['postre'],
  },
];

async function seedMenuAndInventory(restaurantId: string) {
  const categoryIds = new Map<string, string>();
  const categories = [...new Set(DISH_CATALOG.map((d) => d.category))];

  for (let i = 0; i < categories.length; i += 1) {
    const categoryName = categories[i];
    const cat = await prisma.category.create({
      data: {
        restaurantId,
        name: categoryName,
        description: `Categoría ${categoryName}`,
        image:
          PBA_MEDIA.categories[
            categoryName as keyof typeof PBA_MEDIA.categories
          ] ?? null,
        order: i,
        isActive: true,
      },
    });
    categoryIds.set(categoryName, cat.id);
  }

  const dishIds = new Map<string, string>();

  for (const item of DISH_CATALOG) {
    const dish = await prisma.dish.create({
      data: {
        restaurantId,
        categoryId: categoryIds.get(item.category)!,
        name: item.name,
        description: item.description,
        price: item.price,
        costPrice: item.costPrice,
        preparationTime: item.prepMinutes,
        tags: [...(item.tags ?? []), DEMO_TAG],
        isFeatured: item.featured ?? false,
        isAvailable: !item.unavailable,
        image:
          PBA_MEDIA.dishes[item.name as keyof typeof PBA_MEDIA.dishes] ?? null,
        avgRating: 0,
        reviewCount: 0,
      },
    });
    dishIds.set(item.name, dish.id);
  }

  const inventory = {
    vacio: await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: 'Vacio premium (kg)',
        unit: 'kg',
        currentStock: 18,
        minStock: 8,
        unitCost: 4200,
        autoDisableDishes: true,
        linkedDishIds: [dishIds.get('Bife de chorizo (400g)')!],
      },
    }),
    entrania: await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: 'Entraña (kg)',
        unit: 'kg',
        currentStock: 6,
        minStock: 5,
        unitCost: 3800,
        autoDisableDishes: true,
        linkedDishIds: [dishIds.get('Entraña (350g)')!],
      },
    }),
    chorizo: await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: 'Chorizo parrillero (u)',
        unit: 'unidad',
        currentStock: 4,
        minStock: 12,
        unitCost: 900,
        autoDisableDishes: true,
        linkedDishIds: [dishIds.get('Choripán artesanal')!],
      },
    }),
    papas: await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: 'Papa (kg)',
        unit: 'kg',
        currentStock: 2.5,
        minStock: 6,
        unitCost: 450,
        autoDisableDishes: false,
        linkedDishIds: [dishIds.get('Papas rústicas')!],
      },
    }),
    provolone: await prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: 'Provoleta (u)',
        unit: 'unidad',
        currentStock: 22,
        minStock: 6,
        unitCost: 1800,
        autoDisableDishes: true,
        linkedDishIds: [dishIds.get('Provoleta a la parrilla')!],
      },
    }),
  };

  const recipeLines: Array<{
    dishName: string;
    inventoryKey: keyof typeof inventory;
    quantity: number;
  }> = [
    {
      dishName: 'Bife de chorizo (400g)',
      inventoryKey: 'vacio',
      quantity: 0.42,
    },
    { dishName: 'Entraña (350g)', inventoryKey: 'entrania', quantity: 0.38 },
    { dishName: 'Choripán artesanal', inventoryKey: 'chorizo', quantity: 1 },
    { dishName: 'Papas rústicas', inventoryKey: 'papas', quantity: 0.25 },
    {
      dishName: 'Provoleta a la parrilla',
      inventoryKey: 'provolone',
      quantity: 1,
    },
  ];

  for (const line of recipeLines) {
    await prisma.dishRecipeLine.create({
      data: {
        dishId: dishIds.get(line.dishName)!,
        inventoryItemId: inventory[line.inventoryKey].id,
        quantity: line.quantity,
      },
    });
  }

  return { dishIds, categoryIds };
}

async function seedBusinessHours(restaurantId: string) {
  const existing = await prisma.businessHour.count({ where: { restaurantId } });
  if (existing > 0) return;

  const schedule: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string;
    closeTime: string;
  }> = [
    { dayOfWeek: 0, isOpen: true, openTime: '12:00', closeTime: '16:00' },
    { dayOfWeek: 1, isOpen: false, openTime: '00:00', closeTime: '00:00' },
    { dayOfWeek: 2, isOpen: true, openTime: '12:00', closeTime: '15:30' },
    { dayOfWeek: 3, isOpen: true, openTime: '12:00', closeTime: '15:30' },
    { dayOfWeek: 4, isOpen: true, openTime: '12:00', closeTime: '15:30' },
    { dayOfWeek: 5, isOpen: true, openTime: '12:00', closeTime: '16:00' },
    { dayOfWeek: 6, isOpen: true, openTime: '12:00', closeTime: '16:00' },
  ];

  await prisma.businessHour.createMany({
    data: schedule.map((slot) => ({ ...slot, restaurantId })),
  });

  // Turno noche mar–sáb
  await prisma.businessHour.createMany({
    data: [2, 3, 4, 5, 6].map((dayOfWeek) => ({
      restaurantId,
      dayOfWeek,
      isOpen: true,
      openTime: '20:00',
      closeTime: '23:30',
    })),
  });
}

async function syncDishReviewStats(restaurantId: string) {
  const dishes = await prisma.dish.findMany({
    where: { restaurantId },
    select: { id: true },
  });

  for (const dish of dishes) {
    const stats = await prisma.review.aggregate({
      where: { dishId: dish.id, isApproved: true },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.dish.update({
      where: { id: dish.id },
      data: {
        avgRating: stats._avg.rating
          ? Math.round(stats._avg.rating * 10) / 10
          : 0,
        reviewCount: stats._count,
      },
    });
  }
}

async function seedFloorAndDelivery(
  restaurantId: string,
  ownerUserId: string | null,
) {
  const salon = await prisma.tableArea.create({
    data: { restaurantId, name: 'Salón principal' },
  });
  const patio = await prisma.tableArea.create({
    data: { restaurantId, name: 'Patio' },
  });

  const tables: Array<{ id: string; number: string }> = [];
  for (let n = 1; n <= 6; n += 1) {
    tables.push(
      await prisma.table.create({
        data: {
          restaurantId,
          areaId: salon.id,
          number: String(n),
          capacity: n <= 2 ? 2 : 4,
          status: TableStatus.AVAILABLE,
          positionX: (n % 3) * 120,
          positionY: Math.floor((n - 1) / 3) * 100,
        },
      }),
    );
  }
  for (let n = 7; n <= 10; n += 1) {
    tables.push(
      await prisma.table.create({
        data: {
          restaurantId,
          areaId: patio.id,
          number: String(n),
          capacity: 6,
          status: TableStatus.AVAILABLE,
          positionX: ((n - 7) % 2) * 140,
          positionY: Math.floor((n - 7) / 2) * 110,
        },
      }),
    );
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      restaurantId,
      name: 'Palermo y alrededores',
      minOrder: 12000,
      deliveryFee: 1800,
      estimatedTime: '35-50 min',
      isActive: true,
      areas: ['Palermo', 'Colegiales', 'Villa Crespo'],
      polygon: PALERMO_ZONE_POLYGON as unknown as Prisma.InputJsonValue,
    },
  });

  const driver = await prisma.deliveryDriver.create({
    data: {
      restaurantId,
      userId: ownerUserId ?? undefined,
      name: 'Martín Reparto',
      phone: '+5491155551234',
      vehicle: 'Moto',
      licensePlate: 'AB123CD',
      isActive: true,
      isAvailable: true,
    },
  });

  return { tables, zone, driver };
}

async function seedCustomers(restaurantId: string): Promise<DemoCustomer[]> {
  const profiles = [
    {
      displayName: 'Lucía Fernández',
      email: 'lucia.fernandez@example.com',
      phone: '+5491144556677',
    },
    {
      displayName: 'Carlos Méndez',
      email: 'carlos.mendez@example.com',
      phone: '+5491133445566',
    },
    {
      displayName: 'Ana Rodríguez',
      email: 'ana.rodriguez@example.com',
      phone: '+5491122334455',
    },
    {
      displayName: 'Diego Sosa',
      email: 'diego.sosa@example.com',
      phone: '+5491111223344',
    },
    {
      displayName: 'María González',
      email: 'maria.gonzalez@example.com',
      phone: '+5491199887766',
    },
  ];

  const created: DemoCustomer[] = [];
  for (const p of profiles) {
    const identity = await prisma.customerIdentity.upsert({
      where: { email: p.email },
      create: { email: p.email, phone: p.phone, emailVerified: true },
      update: { phone: p.phone },
    });

    const profile = await prisma.restaurantCustomerProfile.create({
      data: {
        restaurantId,
        identityId: identity.id,
        displayName: p.displayName,
        email: p.email,
        phone: p.phone,
        marketingOptIn: true,
      },
    });

    created.push({
      id: profile.id,
      displayName: profile.displayName,
      email: p.email,
      phone: p.phone,
    });
  }
  return created;
}

type OrderSeedInput = {
  restaurantId: string;
  orderNumber: string;
  dishIds: Map<string, string>;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerProfileId?: string;
  type: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  items: Array<{ dishName: string; quantity: number }>;
  createdAt: Date;
  orderSource?: OrderSource;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  tableId?: string;
  notes?: string;
  preparedAt?: Date;
  readyAt?: Date;
  paidAt?: Date;
  confirmedAt?: Date;
  preparingAt?: Date;
  deliveredAt?: Date;
};

async function createOrder(input: OrderSeedInput) {
  const lines = input.items.map((item) => {
    const dish = DISH_CATALOG.find((d) => d.name === item.dishName);
    if (!dish) throw new Error(`Plato no encontrado: ${item.dishName}`);
    const unitPrice = dish.price;
    return {
      dishId: input.dishIds.get(item.dishName)!,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * item.quantity,
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const deliveryFee = input.type === OrderType.DELIVERY ? 1800 : 0;
  const total = subtotal + deliveryFee;

  const order = await prisma.order.create({
    data: {
      restaurantId: input.restaurantId,
      orderNumber: input.orderNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      customerProfileId: input.customerProfileId,
      type: input.type,
      status: input.status,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      subtotal,
      deliveryFee,
      total,
      deliveryAddress: input.deliveryAddress,
      deliveryZoneId: input.deliveryZoneId,
      tableId: input.tableId,
      orderSource: input.orderSource ?? OrderSource.ONLINE,
      notes: input.notes,
      publicTrackingToken: `track-${input.orderNumber}`,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      confirmedAt: input.confirmedAt,
      preparingAt: input.preparingAt,
      preparedAt: input.preparedAt,
      readyAt: input.readyAt,
      paidAt: input.paidAt,
      deliveredAt: input.deliveredAt,
      items: {
        create: lines.map((l) => ({
          dishId: l.dishId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
        })),
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            createdAt: input.createdAt,
          },
          ...(input.status !== OrderStatus.PENDING
            ? [
                {
                  fromStatus: OrderStatus.PENDING,
                  toStatus: input.status,
                  createdAt:
                    input.confirmedAt ?? input.preparingAt ?? input.createdAt,
                },
              ]
            : []),
        ],
      },
    },
    include: { items: true },
  });

  return order;
}

async function seedOrders(
  restaurantId: string,
  dishIds: Map<string, string>,
  customers: DemoCustomer[],
  zoneId: string,
  driverId: string,
  tables: Array<{ id: string; number: string }>,
) {
  let seq = 1000;
  const nextNumber = () => {
    seq += 1;
    return `PBA-${seq}`;
  };

  const historical: OrderSeedInput[] = [];
  for (let day = 29; day >= 1; day -= 1) {
    const ordersThisDay = day % 3 === 0 ? 4 : day % 2 === 0 ? 3 : 2;
    for (let i = 0; i < ordersThisDay; i += 1) {
      const customer = customers[(day + i) % customers.length];
      const at = daysAgo(day, 12 + i, 15 + i * 7);
      const isDelivery = i % 4 === 0;
      const deliveredAt = isDelivery
        ? new Date(at.getTime() + 55 * 60_000)
        : undefined;
      historical.push({
        restaurantId,
        orderNumber: nextNumber(),
        dishIds,
        customerName: customer.displayName,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        customerProfileId: customer.id,
        type: isDelivery
          ? OrderType.DELIVERY
          : i % 3 === 0
            ? OrderType.PICKUP
            : OrderType.DINE_IN,
        status: isDelivery ? OrderStatus.DELIVERED : OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: i % 2 === 0 ? 'mercadopago' : 'cash',
        items: [
          { dishName: 'Bife de chorizo (400g)', quantity: 1 },
          { dishName: 'Papas rústicas', quantity: 1 },
        ],
        createdAt: at,
        confirmedAt: at,
        preparingAt: new Date(at.getTime() + 5 * 60000),
        preparedAt: new Date(at.getTime() + 25 * 60000),
        readyAt: new Date(at.getTime() + 28 * 60000),
        paidAt: new Date(at.getTime() + 35 * 60000),
        deliveredAt,
        deliveryZoneId: isDelivery ? zoneId : undefined,
        deliveryAddress: isDelivery ? 'Thames 1234, CABA' : undefined,
      });
    }
  }

  const todayOrders: OrderSeedInput[] = [
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: 'Cliente web — pago fallido',
      customerPhone: '+5491100000001',
      customerEmail: 'pago.fallido@example.com',
      type: OrderType.DELIVERY,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.FAILED,
      paymentMethod: 'mercadopago',
      items: [
        { dishName: 'Entraña (350g)', quantity: 1 },
        { dishName: 'Ensalada mixta', quantity: 1 },
      ],
      createdAt: hoursAgo(0.4),
      deliveryZoneId: zoneId,
      deliveryAddress: 'Honduras 4500, Palermo',
      notes: 'Sin cebolla',
    },
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: customers[0].displayName,
      customerPhone: customers[0].phone,
      customerEmail: customers[0].email,
      customerProfileId: customers[0].id,
      type: OrderType.PICKUP,
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'mercadopago',
      items: [{ dishName: 'Tira de asado (500g)', quantity: 2 }],
      createdAt: hoursAgo(0.8),
      confirmedAt: hoursAgo(0.75),
      paidAt: hoursAgo(0.75),
    },
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: 'Mesa express',
      customerPhone: '+5491100000002',
      type: OrderType.DINE_IN,
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: 'cash',
      orderSource: OrderSource.FLOOR_COMANDA,
      tableId: tables[2].id,
      items: [
        { dishName: 'Bife de chorizo (400g)', quantity: 2 },
        { dishName: 'Malbec copa', quantity: 2 },
      ],
      createdAt: hoursAgo(1.2),
      confirmedAt: hoursAgo(1.15),
      preparingAt: hoursAgo(1.1),
      notes: 'Punto medio',
    },
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: 'Cocina atrasada',
      customerPhone: '+5491100000003',
      type: OrderType.DELIVERY,
      status: OrderStatus.PREPARING,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'mercadopago',
      items: [
        { dishName: 'Milanesa napolitana', quantity: 1 },
        { dishName: 'Papas rústicas', quantity: 1 },
      ],
      createdAt: hoursAgo(2.1),
      confirmedAt: hoursAgo(2.05),
      preparingAt: hoursAgo(2),
      paidAt: hoursAgo(2.05),
      deliveryZoneId: zoneId,
      deliveryAddress: 'El Salvador 4800, Palermo',
    },
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: customers[1].displayName,
      customerPhone: customers[1].phone,
      customerEmail: customers[1].email,
      customerProfileId: customers[1].id,
      type: OrderType.PICKUP,
      status: OrderStatus.READY,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'mercadopago',
      items: [{ dishName: 'Choripán artesanal', quantity: 3 }],
      createdAt: hoursAgo(0.5),
      confirmedAt: hoursAgo(0.45),
      preparingAt: hoursAgo(0.4),
      preparedAt: hoursAgo(0.2),
      readyAt: hoursAgo(0.15),
      paidAt: hoursAgo(0.45),
    },
    {
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: customers[2].displayName,
      customerPhone: customers[2].phone,
      customerEmail: customers[2].email,
      customerProfileId: customers[2].id,
      type: OrderType.DELIVERY,
      status: OrderStatus.READY,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'mercadopago',
      items: [
        { dishName: 'Provoleta a la parrilla', quantity: 1 },
        { dishName: 'Morcilla vasca', quantity: 1 },
      ],
      createdAt: hoursAgo(0.9),
      confirmedAt: hoursAgo(0.85),
      preparingAt: hoursAgo(0.8),
      preparedAt: hoursAgo(0.35),
      readyAt: hoursAgo(0.3),
      paidAt: hoursAgo(0.85),
      deliveryZoneId: zoneId,
      deliveryAddress: 'Malabia 2100, CABA',
    },
    ...Array.from({ length: 6 }).map((_, i) => ({
      restaurantId,
      orderNumber: nextNumber(),
      dishIds,
      customerName: customers[i % customers.length].displayName,
      customerPhone: customers[i % customers.length].phone,
      customerEmail: customers[i % customers.length].email,
      customerProfileId: customers[i % customers.length].id,
      type: (i % 2 === 0 ? OrderType.DINE_IN : OrderType.PICKUP) as OrderType,
      status: OrderStatus.PAID,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: 'cash',
      items: [
        {
          dishName: i % 2 === 0 ? 'Entraña (350g)' : 'Tira de asado (500g)',
          quantity: 1,
        },
        { dishName: 'Flan casero con dulce de leche', quantity: 1 },
      ],
      createdAt: todayAt(11 + i, 10 + i * 5),
      confirmedAt: todayAt(11 + i, 12 + i * 5),
      preparingAt: todayAt(11 + i, 15 + i * 5),
      preparedAt: todayAt(11 + i, 35 + i * 5),
      readyAt: todayAt(11 + i, 40 + i * 5),
      paidAt: todayAt(11 + i, 45 + i * 5),
      tableId: i % 2 === 0 ? tables[i % tables.length].id : undefined,
      orderSource: (i % 2 === 0
        ? OrderSource.FLOOR_FINAL
        : OrderSource.ONLINE) as OrderSource,
    })),
  ];

  const createdToday: Awaited<ReturnType<typeof createOrder>>[] = [];
  for (const spec of [...historical, ...todayOrders]) {
    createdToday.push(await createOrder(spec));
  }

  const activeDelivery = createdToday.find(
    (o) =>
      o.customerName === customers[2].displayName &&
      o.status === OrderStatus.READY,
  );
  if (activeDelivery) {
    await prisma.deliveryOrder.create({
      data: {
        orderId: activeDelivery.id,
        driverId,
        zoneId,
        deliveryAddress: 'Malabia 2100, CABA',
        status: DeliveryStatus.ASSIGNED,
        deliveryFee: 1800,
        assignedAt: hoursAgo(0.2),
        estimatedDeliveryTime: 40,
      },
    });
  }

  await prisma.table.update({
    where: { id: tables[2].id },
    data: {
      status: TableStatus.OCCUPIED,
      customerName: 'Mesa express',
      occupiedSince: hoursAgo(1.2),
    },
  });

  return createdToday;
}

async function seedReservations(
  restaurantId: string,
  tables: Array<{ id: string; number: string }>,
  customers: DemoCustomer[],
) {
  const today = startOfToday();

  await prisma.reservation.createMany({
    data: [
      {
        restaurantId,
        customerName: 'Grupo corporativo',
        customerEmail: 'eventos@empresa.com',
        customerPhone: '+5491100000100',
        date: today,
        time: '20:30',
        partySize: 8,
        status: ReservationStatus.PENDING,
        specialRequests: 'Mesa tranquila, cumpleaños',
        publicAccessToken: 'res-pba-pending-1',
      },
      {
        restaurantId,
        customerName: customers[3].displayName,
        customerEmail: customers[3].email,
        customerPhone: customers[3].phone,
        date: today,
        time: '21:00',
        partySize: 4,
        status: ReservationStatus.CONFIRMED,
        tableId: tables[6].id,
        publicAccessToken: 'res-pba-confirmed-1',
      },
      {
        restaurantId,
        customerName: customers[4].displayName,
        customerEmail: customers[4].email,
        customerPhone: customers[4].phone,
        date: today,
        time: '13:30',
        partySize: 2,
        status: ReservationStatus.SEATED,
        tableId: tables[0].id,
        publicAccessToken: 'res-pba-seated-1',
      },
      {
        restaurantId,
        customerName: 'Familia Ruiz',
        customerEmail: 'ruiz@example.com',
        customerPhone: '+5491100000200',
        date: daysAgo(1, 21, 0),
        time: '21:00',
        partySize: 5,
        status: ReservationStatus.NO_SHOW,
        publicAccessToken: 'res-pba-noshow-1',
      },
      {
        restaurantId,
        customerName: customers[0].displayName,
        customerEmail: customers[0].email,
        customerPhone: customers[0].phone,
        date: daysAgo(2, 20, 30),
        time: '20:30',
        partySize: 3,
        status: ReservationStatus.COMPLETED,
        tableId: tables[1].id,
        publicAccessToken: 'res-pba-completed-1',
      },
    ],
  });
}

async function seedDailyOperation(restaurantId: string) {
  await prisma.dailyOperation.create({
    data: {
      restaurantId,
      businessDate: businessDateOnly(),
      dailyGoal: 'Vender 45 cubiertos y mantener tiempos de cocina bajo 30 min',
      openingChecklist: {
        items: [
          { id: 'grill', label: 'Parrilla encendida', done: true },
          { id: 'stock', label: 'Stock crítico revisado', done: true },
          {
            id: 'reservations',
            label: 'Reservas del día confirmadas',
            done: true,
          },
        ],
      },
      openingCompletedAt: todayAt(10, 30),
      openingNotes: 'Turno mediodía listo. Faltan chorizos.',
    },
  });
}

async function seedHealthSnapshots(restaurantId: string) {
  const rows: Prisma.BusinessHealthSnapshotCreateManyInput[] = [];
  for (let day = 29; day >= 0; day -= 1) {
    const trend = 62 + Math.round((29 - day) * 0.8);
    rows.push({
      restaurantId,
      snapshotDate: daysAgo(day, 23, 0),
      overall: Math.min(92, trend + (day % 5)),
      operational: Math.min(90, trend - 4 + (day % 3)),
      commercial: Math.min(95, trend + 6),
      margin: Math.min(88, trend - 2),
    });
  }
  await prisma.businessHealthSnapshot.createMany({ data: rows });
}

async function seedBusinessEvents(
  restaurantId: string,
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
  }>,
) {
  const delayed = orders.find(
    (o) =>
      o.orderNumber.includes('1005') || o.customerName === 'Cocina atrasada',
  );
  const failed = orders.find((o) => o.customerName.includes('pago fallido'));

  const events: Prisma.BusinessEventCreateManyInput[] = [
    {
      restaurantId,
      eventType: 'RestaurantOpened',
      source: 'daily-operations',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: todayAt(10, 30),
      payload: {
        date: businessDateOnly().toISOString(),
        openedAt: todayAt(10, 30).toISOString(),
      },
    },
    {
      restaurantId,
      eventType: 'OrderCreated',
      source: 'orders',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: hoursAgo(0.4),
      payload: {
        orderId: failed?.id ?? orders[0].id,
        orderNumber: failed?.orderNumber ?? orders[0].orderNumber,
        type: 'DELIVERY',
        total: failed?.total ?? orders[0].total,
        customerName: failed?.customerName ?? orders[0].customerName,
        itemCount: 2,
      },
    },
    {
      restaurantId,
      eventType: 'PaymentFailed',
      source: 'payments',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: hoursAgo(0.35),
      payload: {
        orderId: failed?.id,
        amount: failed?.total ?? 24000,
        reason: 'tarjeta_rechazada',
      },
    },
    {
      restaurantId,
      eventType: 'OrderDelayed',
      source: 'orders',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: hoursAgo(0.5),
      payload: {
        orderId: delayed?.id ?? orders[0].id,
        orderNumber: delayed?.orderNumber ?? orders[0].orderNumber,
        delayMinutes: 48,
        status: 'PREPARING',
      },
    },
    {
      restaurantId,
      eventType: 'InventoryLowStock',
      source: 'inventory',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: hoursAgo(1),
      payload: {
        inventoryItemName: 'Chorizo parrillero (u)',
        currentStock: 4,
        minStock: 12,
        affectedDishNames: ['Choripán artesanal'],
      },
    },
    {
      restaurantId,
      eventType: 'ProductOutOfStock',
      source: 'inventory',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: hoursAgo(0.9),
      payload: { dishId: 'choripan', dishName: 'Choripán artesanal' },
    },
    {
      restaurantId,
      eventType: 'ReservationPendingConfirmation',
      source: 'reservations',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: hoursAgo(2),
      payload: {
        reservationId: 'res-pba-pending-1',
        customerName: 'Grupo corporativo',
        date: startOfToday().toISOString(),
        time: '20:30',
        partySize: 8,
      },
    },
    {
      restaurantId,
      eventType: 'ReservationCreated',
      source: 'reservations',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: hoursAgo(3),
      payload: {
        reservationId: 'res-pba-confirmed-1',
        customerName: 'Diego Sosa',
        date: startOfToday().toISOString(),
        time: '21:00',
        partySize: 4,
      },
    },
    {
      restaurantId,
      eventType: 'ReservationNoShow',
      source: 'reservations',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: daysAgo(1, 21, 30),
      payload: {
        reservationId: 'res-pba-noshow-1',
        customerName: 'Familia Ruiz',
        date: daysAgo(1).toISOString(),
        time: '21:00',
        partySize: 5,
      },
    },
    {
      restaurantId,
      eventType: 'CustomerReturned',
      source: 'customers',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: hoursAgo(5),
      payload: {
        customerProfileId: 'seed-customer',
        customerName: 'Lucía Fernández',
        daysSinceLastOrder: 34,
      },
    },
    {
      restaurantId,
      eventType: 'CustomerInactive',
      source: 'customers',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: daysAgo(3),
      payload: {
        customerProfileId: 'seed-inactive',
        customerName: 'María González',
        daysInactive: 45,
      },
    },
    {
      restaurantId,
      eventType: 'DeliveryAssigned',
      source: 'delivery',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: hoursAgo(0.2),
      payload: {
        orderNumber: 'PBA-active-delivery',
        driverName: 'Martín Reparto',
      },
    },
    {
      restaurantId,
      eventType: 'PaymentRecovered',
      source: 'payments',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: daysAgo(2, 19, 0),
      payload: {
        orderId: orders[5]?.id,
        orderNumber: orders[5]?.orderNumber,
        amount: 19800,
      },
    },
    {
      restaurantId,
      eventType: 'DailyClosingMissing',
      source: 'daily-operations',
      importance: BusinessEventImportance.HIGH,
      replayPolicy: BusinessEventReplayPolicy.SUMMARY,
      occurredAt: daysAgo(1, 23, 45),
      payload: { businessDate: daysAgo(1).toISOString() },
    },
    {
      restaurantId,
      eventType: 'MarketingPublished',
      source: 'builder',
      importance: BusinessEventImportance.NORMAL,
      replayPolicy: BusinessEventReplayPolicy.FULL,
      occurredAt: daysAgo(7),
      payload: { publishedAt: daysAgo(7).toISOString() },
    },
  ];

  await prisma.businessEvent.createMany({ data: events });
}

async function seedBusinessMemories(restaurantId: string) {
  await prisma.businessMemory.createMany({
    data: [
      {
        restaurantId,
        memoryKey: 'operational:kitchen-delay-lunch',
        category: BusinessMemoryCategory.OPERATIONAL,
        status: BusinessMemoryStatus.ACTIVE,
        title: 'Demoras recurrentes al mediodía',
        summary: 'Los pedidos delivery superan 40 min entre 13:00 y 14:30.',
        occurrenceCount: 4,
        firstSeenAt: daysAgo(12),
        lastSeenAt: hoursAgo(0.5),
        metadata: { peakWindow: '13:00-14:30' },
      },
      {
        restaurantId,
        memoryKey: 'inventory:low:chorizo',
        category: BusinessMemoryCategory.INVENTORY,
        status: BusinessMemoryStatus.ACTIVE,
        title: 'Chorizo parrillero bajo mínimo',
        summary: 'Quedan 4 unidades; afecta Choripán artesanal.',
        occurrenceCount: 3,
        firstSeenAt: daysAgo(2),
        lastSeenAt: hoursAgo(1),
        metadata: { currentStock: 4, minStock: 12 },
      },
      {
        restaurantId,
        memoryKey: 'sales:weekend-bife',
        category: BusinessMemoryCategory.SALES,
        status: BusinessMemoryStatus.ACTIVE,
        title: 'Bife de chorizo lidera fin de semana',
        summary: 'Es el plato más pedido viernes y sábado (+22% vs promedio).',
        occurrenceCount: 6,
        firstSeenAt: daysAgo(20),
        lastSeenAt: daysAgo(2),
      },
      {
        restaurantId,
        memoryKey: 'growth:inactive-maria',
        category: BusinessMemoryCategory.GROWTH,
        status: BusinessMemoryStatus.ACTIVE,
        title: 'Cliente inactivo: María González',
        summary: 'Sin pedidos en 45 días. Candidata a win-back.',
        occurrenceCount: 1,
        firstSeenAt: daysAgo(3),
        lastSeenAt: daysAgo(3),
      },
      {
        restaurantId,
        memoryKey: 'recommendation:margin-milanesa',
        category: BusinessMemoryCategory.RECOMMENDATION,
        status: BusinessMemoryStatus.ACTIVE,
        title: 'Revisar costo de milanesa napolitana',
        summary: 'Margen por debajo del 55% objetivo del local.',
        occurrenceCount: 2,
        firstSeenAt: daysAgo(8),
        lastSeenAt: daysAgo(1),
      },
    ],
  });
}

async function seedReviewsAndLoyalty(
  restaurantId: string,
  dishIds: Map<string, string>,
  customers: DemoCustomer[],
  orders: Array<{ id: string }>,
) {
  const reviewRows = REVIEW_SEEDS.map((seed) => ({
    restaurantId,
    dishId: seed.dishName ? dishIds.get(seed.dishName) : undefined,
    customerName: seed.customerName,
    customerEmail: seed.customerEmail,
    rating: seed.rating,
    comment: seed.comment,
    isApproved: seed.approved ?? true,
    createdAt: daysAgo(seed.daysAgo),
  }));

  await prisma.review.createMany({ data: reviewRows });

  if (orders[10]?.id) {
    await prisma.review.create({
      data: {
        restaurantId,
        orderId: orders[10].id,
        customerName: customers[0]?.displayName ?? 'Cliente salón',
        customerEmail: customers[0]?.email,
        rating: 4,
        comment: 'Excelente atención en salón. Falta aprobar en moderación.',
        isApproved: false,
        createdAt: hoursAgo(6),
      },
    });
  }

  await syncDishReviewStats(restaurantId);

  const loyalty = await prisma.loyaltyAccount.create({
    data: {
      restaurantId,
      customerProfileId: customers[0].id,
      customerEmail: customers[0].email,
      customerName: customers[0].displayName,
      customerPhone: customers[0].phone,
      points: 420,
      totalEarned: 1180,
      totalRedeemed: 760,
      tier: 'SILVER',
    },
  });

  await prisma.loyaltyTransaction.createMany({
    data: [
      {
        accountId: loyalty.id,
        type: 'EARN',
        points: 180,
        description: 'Pedido PBA-1042',
        orderId: orders[8]?.id,
        createdAt: daysAgo(5),
      },
      {
        accountId: loyalty.id,
        type: 'REDEEM',
        points: -120,
        description: 'Canje postre',
        createdAt: daysAgo(2),
      },
    ],
  });
}

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: RESTAURANT_SLUG },
    select: { id: true, name: true },
  });

  if (!restaurant) {
    throw new Error(
      `No existe un restaurante con slug "${RESTAURANT_SLUG}". Creá la cuenta primero o ajustá el slug.`,
    );
  }

  const existingDishes = await prisma.dish.count({
    where: { restaurantId: restaurant.id },
  });

  if (existingDishes > 0 && !fresh) {
    console.log(
      `ℹ️  "${restaurant.name}" ya tiene ${existingDishes} platos. Usá --fresh para recargar.`,
    );
    return;
  }

  if (fresh || existingDishes > 0) {
    await wipeOperationalData(restaurant.id);
  }

  console.log(
    `🥩 Sembrando demo para "${restaurant.name}" (${RESTAURANT_SLUG})...`,
  );

  await ensureRestaurantConfig(restaurant.id);
  await seedBusinessHours(restaurant.id);
  const ownerUserId = await resolveRestaurantOwnerUserId(restaurant.id);
  const { dishIds } = await seedMenuAndInventory(restaurant.id);
  const { tables, zone, driver } = await seedFloorAndDelivery(
    restaurant.id,
    ownerUserId,
  );
  const customers = await seedCustomers(restaurant.id);
  const orders = await seedOrders(
    restaurant.id,
    dishIds,
    customers,
    zone.id,
    driver.id,
    tables,
  );
  await seedReservations(restaurant.id, tables, customers);
  await seedDailyOperation(restaurant.id);
  await seedHealthSnapshots(restaurant.id);
  await seedBusinessEvents(
    restaurant.id,
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      total: o.total,
    })),
  );
  await seedBusinessMemories(restaurant.id);
  await seedReviewsAndLoyalty(restaurant.id, dishIds, customers, orders);

  const summary = await prisma.$transaction([
    prisma.dish.count({ where: { restaurantId: restaurant.id } }),
    prisma.order.count({ where: { restaurantId: restaurant.id } }),
    prisma.reservation.count({ where: { restaurantId: restaurant.id } }),
    prisma.businessEvent.count({ where: { restaurantId: restaurant.id } }),
    prisma.inventoryItem.count({ where: { restaurantId: restaurant.id } }),
    prisma.review.count({ where: { restaurantId: restaurant.id } }),
    prisma.dish.count({
      where: { restaurantId: restaurant.id, image: { not: null } },
    }),
  ]);

  console.log('\n✅ Demo cargada');
  console.log(`   Platos: ${summary[0]} (${summary[6]} con foto)`);
  console.log(`   Pedidos: ${summary[1]} (histórico + situaciones de hoy)`);
  console.log(`   Reservas: ${summary[2]}`);
  console.log(`   Eventos de negocio: ${summary[3]}`);
  console.log(`   Insumos: ${summary[4]}`);
  console.log(
    `   Reseñas: ${summary[5]} (platos + local, con moderación pendiente)`,
  );
  console.log('   Branding: logo, portada, hero y galería cargados');
  console.log('\n📍 Escenarios incluidos:');
  console.log('   • Pedido con pago fallido y otro demorado en cocina');
  console.log('   • Delivery asignado + retiro listo');
  console.log('   • Reserva pendiente de confirmación y no-show de ayer');
  console.log('   • Stock bajo de chorizo y papas (inventario/recetas)');
  console.log('   • 30 días de pedidos + snapshots de salud del negocio');
  console.log('   • Memorias y eventos para Diario / Centro de atención');
  console.log('   • Logo, fotos de platos/categorías y reseñas por producto');
  console.log(
    '   • Go-live completo: contacto, MP, directorio, apertura, delivery',
  );
  console.log(
    `\n🔑 Ingresá al admin con tu usuario existente y elegí "${restaurant.name}".`,
  );
  console.log(`   Sitio público: /${RESTAURANT_SLUG}`);
}

main()
  .catch((error) => {
    console.error('❌ seed-parrilla-demo falló:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
