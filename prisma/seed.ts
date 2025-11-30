import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Mock data - copiar desde frontend/src/lib/mock-data.ts
const MENU_DATA = [
  {
    name: 'Entradas',
    description: 'Para empezar',
    dishes: [
      {
        name: 'Empanadas de Carne',
        description: 'Empanadas caseras rellenas de carne',
        price: 1800,
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950',
      },
      // ... más platos
    ],
  },
  // ... más categorías
];

async function main() {
  console.log('🌱 Seeding database...');

  // Limpiar datos existentes
  await prisma.dish.deleteMany();
  await prisma.category.deleteMany();
  await prisma.restaurant.deleteMany();

  // Crear restaurante demo
  const restaurant = await prisma.restaurant.create({
    data: {
      slug: 'demo-restaurant',
      name: 'Restaurante Demo',
      type: 'restaurant',
      cuisineTypes: ['Argentina', 'Italiana'],
      description: 'Un restaurante de demostración',
      email: 'demo@restaurant.com',
      phone: '+54 11 1234-5678',
      address: 'Av. Corrientes 1234',
      city: 'Buenos Aires',
      country: 'Argentina',
      primaryColor: '#4f46e5',
      secondaryColor: '#9333ea',
      accentColor: '#ec4899',
    },
  });

  console.log('✅ Restaurant created:', restaurant.name);

  // Crear categorías y platos
  for (const categoryData of MENU_DATA) {
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: categoryData.name,
        description: categoryData.description,
        order: 0,
        isActive: true,
      },
    });

    console.log(`✅ Category created: ${category.name}`);

    for (const dishData of categoryData.dishes) {
      await prisma.dish.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: dishData.name,
          description: dishData.description,
          price: dishData.price,
          image: dishData.image,
          isAvailable: true,
          isFeatured: false,
        },
      });
    }
  }

  // Crear horarios
  const daysOfWeek = [
    { day: 1, name: 'Lunes' },
    { day: 2, name: 'Martes' },
    { day: 3, name: 'Miércoles' },
    { day: 4, name: 'Jueves' },
    { day: 5, name: 'Viernes' },
    { day: 6, name: 'Sábado' },
    { day: 0, name: 'Domingo' },
  ];

  for (const { day } of daysOfWeek) {
    await prisma.businessHour.create({
      data: {
        restaurantId: restaurant.id,
        dayOfWeek: day,
        isOpen: true,
        openTime: '09:00',
        closeTime: '22:00',
      },
    });
  }

  console.log('✅ Business hours created');
  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
