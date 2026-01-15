const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createSuperAdminRole() {
  try {
    // Check if SUPER_ADMIN role already exists
    const existingRole = await prisma.role.findFirst({
      where: { name: 'SUPER_ADMIN' },
    });

    if (existingRole) {
      console.log('SUPER_ADMIN role already exists');
      return;
    }

    // Create SUPER_ADMIN role
    const superAdminRole = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        permissions: ['all'], // All permissions
        color: '#ff0000', // Red color
        isSystemRole: true,
        // restaurantId: null, // Global role - omit for global
      },
    });

    console.log('SUPER_ADMIN role created:', superAdminRole.id);

    // Now, assign to the creator user
    // Assuming the creator email is known, e.g., 'valen@example.com'
    const creatorEmail = 'valen@example.com'; // Replace with actual email

    const user = await prisma.user.findUnique({
      where: { email: creatorEmail },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: superAdminRole.id },
      });
      console.log('Assigned SUPER_ADMIN role to user:', user.email);
    } else {
      console.log('User not found with email:', creatorEmail);
    }
  } catch (error) {
    console.error('Error creating SUPER_ADMIN role:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdminRole();
