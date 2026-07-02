/**
 * Promote a user to SUPER_ADMIN by email (E2E / dev bootstrap).
 * Usage: npx tsx prisma/scripts/e2e-promote-super-admin.ts user@example.com
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email) {
    console.error('Usage: npx tsx prisma/scripts/e2e-promote-super-admin.ts <email>')
    process.exit(1)
  }

  let role = await prisma.role.findFirst({
    where: { name: 'SUPER_ADMIN', restaurantId: null },
  })

  if (!role) {
    role = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        permissions: ['all', 'super_admin'],
        color: '#ef4444',
        isSystemRole: true,
      },
    })
  }

  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  if (!user) {
    console.error(`User not found: ${email}`)
    process.exit(1)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { roleId: role.id },
  })

  console.log(`Promoted ${email} to SUPER_ADMIN`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
