const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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
  } else {
    console.log('SUPER_ADMIN role already exists.');
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
  });
