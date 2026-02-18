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
    update: {},
    create: {
      id: 'STARTER',
      displayName: 'Starter',
      description: 'Ideal para empezar tu negocio de restaurante',
      price: 0,
      interval: 'monthly',
      trialDays: 30,
      color: 'from-blue-400 to-blue-600',
      order: 1,
      isActive: true,
      isDefault: true,
      restrictions: {
        create: [
          // Límites
          {
            key: 'products',
            type: 'limit',
            value: '50',
            displayName: 'Productos',
            description: 'Cantidad máxima de productos en el menú',
            category: 'limits',
          },
          {
            key: 'users',
            type: 'limit',
            value: '3',
            displayName: 'Usuarios',
            description: 'Cantidad de usuarios del sistema',
            category: 'limits',
          },
          {
            key: 'tables',
            type: 'limit',
            value: '10',
            displayName: 'Mesas',
            description: 'Cantidad de mesas gestionables',
            category: 'limits',
          },
          {
            key: 'orders_per_month',
            type: 'limit',
            value: '100',
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
            value: 'true',
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
            value: 'email',
            displayName: 'Soporte',
            description: 'Nivel de soporte técnico',
            category: 'support',
          },
        ],
      },
    },
  });

  const professionalPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'PROFESSIONAL' },
    update: {},
    create: {
      id: 'PROFESSIONAL',
      displayName: 'Professional',
      description: 'Para restaurantes establecidos que buscan crecer',
      price: 29999, // $29,999
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
    update: {},
    create: {
      id: 'ENTERPRISE',
      displayName: 'Enterprise',
      description: 'Solución completa para cadenas y grandes restaurantes',
      price: 79999, // $79,999
      interval: 'monthly',
      trialDays: 7,
      color: 'from-amber-400 to-amber-600',
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
