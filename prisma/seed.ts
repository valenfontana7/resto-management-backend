import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================
  // 1. SUBSCRIPTION PLANS
  // ============================================
  console.log('Creating subscription plans...');

  const starterPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'STARTER' },
    update: {
      displayName: 'Directo',
      description: 'Para empezar a vender por link y QR.',
      price: 2500000, // $25.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-stone-500 to-stone-700',
      order: 1,
      isActive: true,
      isDefault: true,
    },
    create: {
      id: 'STARTER',
      displayName: 'Directo',
      description: 'Para empezar a vender por link y QR.',
      price: 2500000, // $25.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-slate-500 to-slate-600',
      order: 1,
      isActive: true,
      isDefault: true,
      restrictions: {
        create: [
          // Límites
          {
            key: 'products',
            type: 'limit',
            value: '10',
            displayName: 'Productos',
            description: 'Cantidad máxima de productos en el menú',
            category: 'limits',
          },
          {
            key: 'users',
            type: 'limit',
            value: '1',
            displayName: 'Usuarios',
            description: 'Cantidad de usuarios del sistema',
            category: 'limits',
          },
          {
            key: 'tables',
            type: 'limit',
            value: '3',
            displayName: 'Mesas',
            description: 'Cantidad de mesas gestionables',
            category: 'limits',
          },
          {
            key: 'orders_per_month',
            type: 'limit',
            value: '0',
            displayName: 'Órdenes mensuales',
            description: 'Límite de órdenes por mes',
            category: 'limits',
          },

          // Features
          {
            key: 'qr_menus',
            type: 'boolean',
            value: 'true',
            displayName: 'Menús QR',
            description: 'Menús digitales con código QR',
            category: 'features',
          },
          {
            key: 'online_orders',
            type: 'boolean',
            value: 'false',
            displayName: 'Pedidos Online',
            description: 'Sistema de pedidos en línea',
            category: 'features',
          },
          {
            key: 'reservations',
            type: 'boolean',
            value: 'false',
            displayName: 'Reservaciones',
            description: 'Sistema de reservas',
            category: 'features',
          },
          {
            key: 'delivery',
            type: 'boolean',
            value: 'false',
            displayName: 'Delivery',
            description: 'Gestión de entregas a domicilio',
            category: 'features',
          },
          {
            key: 'analytics',
            type: 'boolean',
            value: 'false',
            displayName: 'Analytics',
            description: 'Reportes y analíticas avanzadas',
            category: 'features',
          },
          {
            key: 'custom_branding',
            type: 'boolean',
            value: 'false',
            displayName: 'Branding Personalizado',
            description: 'Personalización completa de marca',
            category: 'features',
          },

          // Integrations
          {
            key: 'mercadopago',
            type: 'boolean',
            value: 'false',
            displayName: 'MercadoPago',
            description: 'Integración con MercadoPago',
            category: 'integrations',
          },
          {
            key: 'whatsapp',
            type: 'boolean',
            value: 'false',
            displayName: 'WhatsApp',
            description: 'Integración con WhatsApp Business',
            category: 'integrations',
          },

          // Support
          {
            key: 'support_level',
            type: 'text',
            value: 'self_service',
            displayName: 'Soporte',
            description: 'Nivel de soporte técnico',
            category: 'support',
          },
        ],
      },
    },
  });

  const starterRestrictionUpdates = [
    {
      key: 'products',
      type: 'limit',
      value: '10',
      displayName: 'Productos',
      description: 'Cantidad maxima de productos en el menu',
      category: 'limits',
    },
    {
      key: 'users',
      type: 'limit',
      value: '1',
      displayName: 'Usuarios',
      description: 'Cantidad de usuarios del sistema',
      category: 'limits',
    },
    {
      key: 'tables',
      type: 'limit',
      value: '3',
      displayName: 'Mesas',
      description: 'Cantidad de mesas gestionables',
      category: 'limits',
    },
    {
      key: 'orders_per_month',
      type: 'limit',
      value: '0',
      displayName: 'Ordenes mensuales',
      description: 'Limite de ordenes por mes',
      category: 'limits',
    },
    {
      key: 'online_orders',
      type: 'boolean',
      value: 'false',
      displayName: 'Pedidos Online',
      description: 'Sistema de pedidos en linea',
      category: 'features',
    },
    {
      key: 'mercadopago',
      type: 'boolean',
      value: 'false',
      displayName: 'MercadoPago',
      description: 'Integracion con MercadoPago',
      category: 'integrations',
    },
    {
      key: 'support_level',
      type: 'text',
      value: 'self_service',
      displayName: 'Soporte',
      description: 'Nivel de soporte tecnico',
      category: 'support',
    },
  ];

  await Promise.all(
    starterRestrictionUpdates.map((restriction) =>
      prisma.planRestriction.upsert({
        where: {
          planId_key: {
            planId: 'STARTER',
            key: restriction.key,
          },
        },
        update: restriction,
        create: {
          ...restriction,
          planId: 'STARTER',
        },
      }),
    ),
  );

  const professionalPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'PROFESSIONAL' },
    update: {
      displayName: 'Operación',
      description: 'Para ordenar pedidos, cocina y reservas.',
      price: 4500000, // $45.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-teal-500 to-emerald-600',
      order: 2,
      isActive: true,
      isDefault: false,
    },
    create: {
      id: 'PROFESSIONAL',
      displayName: 'Operación',
      description: 'Para ordenar pedidos, cocina y reservas.',
      price: 4500000, // $45.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-purple-400 to-purple-600',
      order: 2,
      isActive: true,
      isDefault: false,
      restrictions: {
        create: [
          // Límites
          {
            key: 'products',
            type: 'limit',
            value: '200',
            displayName: 'Productos',
            description: 'Cantidad máxima de productos en el menú',
            category: 'limits',
          },
          {
            key: 'users',
            type: 'limit',
            value: '10',
            displayName: 'Usuarios',
            description: 'Cantidad de usuarios del sistema',
            category: 'limits',
          },
          {
            key: 'tables',
            type: 'limit',
            value: '50',
            displayName: 'Mesas',
            description: 'Cantidad de mesas gestionables',
            category: 'limits',
          },
          {
            key: 'orders_per_month',
            type: 'limit',
            value: '1000',
            displayName: 'Órdenes mensuales',
            description: 'Límite de órdenes por mes',
            category: 'limits',
          },

          // Features
          {
            key: 'qr_menus',
            type: 'boolean',
            value: 'true',
            displayName: 'Menús QR',
            description: 'Menús digitales con código QR',
            category: 'features',
          },
          {
            key: 'online_orders',
            type: 'boolean',
            value: 'true',
            displayName: 'Pedidos Online',
            description: 'Sistema de pedidos en línea',
            category: 'features',
          },
          {
            key: 'reservations',
            type: 'boolean',
            value: 'true',
            displayName: 'Reservaciones',
            description: 'Sistema de reservas',
            category: 'features',
          },
          {
            key: 'delivery',
            type: 'boolean',
            value: 'true',
            displayName: 'Delivery',
            description: 'Gestión de entregas a domicilio',
            category: 'features',
          },
          {
            key: 'analytics',
            type: 'boolean',
            value: 'true',
            displayName: 'Analytics',
            description: 'Reportes y analíticas avanzadas',
            category: 'features',
          },
          {
            key: 'custom_branding',
            type: 'boolean',
            value: 'true',
            displayName: 'Branding Personalizado',
            description: 'Personalización completa de marca',
            category: 'features',
          },

          // Integrations
          {
            key: 'mercadopago',
            type: 'boolean',
            value: 'true',
            displayName: 'MercadoPago',
            description: 'Integración con MercadoPago',
            category: 'integrations',
          },
          {
            key: 'whatsapp',
            type: 'boolean',
            value: 'true',
            displayName: 'WhatsApp',
            description: 'Integración con WhatsApp Business',
            category: 'integrations',
          },

          // Support
          {
            key: 'support_level',
            type: 'text',
            value: 'priority',
            displayName: 'Soporte',
            description: 'Soporte prioritario',
            category: 'support',
          },
        ],
      },
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'ENTERPRISE' },
    update: {
      displayName: 'Full',
      description: 'Para locales con necesidades puntuales.',
      price: 7000000, // $70.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-amber-500 to-orange-600',
      order: 3,
      isActive: true,
      isDefault: false,
    },
    create: {
      id: 'ENTERPRISE',
      displayName: 'Full',
      description: 'Para locales con necesidades puntuales.',
      price: 7000000, // $70.000 ARS (en centavos)
      interval: 'monthly',
      trialDays: 14,
      color: 'from-amber-500 to-orange-600',
      order: 3,
      isActive: true,
      isDefault: false,
      restrictions: {
        create: [
          // Límites
          {
            key: 'products',
            type: 'limit',
            value: '9999',
            displayName: 'Productos',
            description: 'Productos ilimitados',
            category: 'limits',
          },
          {
            key: 'users',
            type: 'limit',
            value: '9999',
            displayName: 'Usuarios',
            description: 'Usuarios ilimitados',
            category: 'limits',
          },
          {
            key: 'tables',
            type: 'limit',
            value: '9999',
            displayName: 'Mesas',
            description: 'Mesas ilimitadas',
            category: 'limits',
          },
          {
            key: 'orders_per_month',
            type: 'limit',
            value: '99999',
            displayName: 'Órdenes mensuales',
            description: 'Órdenes ilimitadas',
            category: 'limits',
          },

          // Features
          {
            key: 'qr_menus',
            type: 'boolean',
            value: 'true',
            displayName: 'Menús QR',
            description: 'Menús digitales con código QR',
            category: 'features',
          },
          {
            key: 'online_orders',
            type: 'boolean',
            value: 'true',
            displayName: 'Pedidos Online',
            description: 'Sistema de pedidos en línea',
            category: 'features',
          },
          {
            key: 'reservations',
            type: 'boolean',
            value: 'true',
            displayName: 'Reservaciones',
            description: 'Sistema de reservas',
            category: 'features',
          },
          {
            key: 'delivery',
            type: 'boolean',
            value: 'true',
            displayName: 'Delivery',
            description: 'Gestión de entregas a domicilio',
            category: 'features',
          },
          {
            key: 'analytics',
            type: 'boolean',
            value: 'true',
            displayName: 'Analytics',
            description: 'Reportes y analíticas avanzadas',
            category: 'features',
          },
          {
            key: 'custom_branding',
            type: 'boolean',
            value: 'true',
            displayName: 'Branding Personalizado',
            description: 'Personalización completa de marca',
            category: 'features',
          },
          {
            key: 'multi_location',
            type: 'boolean',
            value: 'true',
            displayName: 'Multi-ubicación',
            description: 'Gestión de múltiples sucursales',
            category: 'features',
          },
          {
            key: 'api_access',
            type: 'boolean',
            value: 'true',
            displayName: 'API Access',
            description: 'Acceso completo a API',
            category: 'features',
          },

          // Integrations
          {
            key: 'mercadopago',
            type: 'boolean',
            value: 'true',
            displayName: 'MercadoPago',
            description: 'Integración con MercadoPago',
            category: 'integrations',
          },
          {
            key: 'whatsapp',
            type: 'boolean',
            value: 'true',
            displayName: 'WhatsApp',
            description: 'Integración con WhatsApp Business',
            category: 'integrations',
          },
          {
            key: 'custom_integrations',
            type: 'boolean',
            value: 'true',
            displayName: 'Integraciones Personalizadas',
            description: 'Desarrollo de integraciones a medida',
            category: 'integrations',
          },

          // Support
          {
            key: 'support_level',
            type: 'text',
            value: 'dedicated',
            displayName: 'Soporte',
            description: 'Soporte dedicado 24/7',
            category: 'support',
          },
        ],
      },
    },
  });

  console.log('✅ Subscription plans created:', {
    starterPlan,
    professionalPlan,
    enterprisePlan,
  });

  // ============================================
  // 2. SYSTEM ROLES
  // ============================================
  // Create System Roles (independent of restaurants)
  const superAdminRole = await prisma.role.findFirst({
    where: {
      name: 'SUPER_ADMIN',
      restaurantId: null,
    },
  });

  if (!superAdminRole) {
    console.log('Creating SUPER_ADMIN role...');
    await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        permissions: ['all', 'super_admin'],
        color: '#000000',
        isSystemRole: true,
        restaurantId: null,
      },
    });
  }

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    pool.end();
  });
