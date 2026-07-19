import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import { validateEnvironment } from '../../common/config/env.validation';

interface DatabaseIdentity {
  databaseName: string;
  serverAddress: string;
}

export async function seedLabAdmin(
  env: Record<string, string | undefined> = process.env,
): Promise<{ userId: string; email: string }> {
  validateEnvironment(env);
  if (!isLabRuntime(env)) {
    throw new Error('El seed de Bentoo Lab requiere BENTOO_RUNTIME_MODE=lab');
  }

  const email = env.BENTOO_LAB_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BENTOO_LAB_ADMIN_PASSWORD?.trim();
  if (!email?.endsWith('.invalid')) {
    throw new Error('BENTOO_LAB_ADMIN_EMAIL debe usar el dominio .invalid');
  }
  if (!password || password.length < 12) {
    throw new Error(
      'BENTOO_LAB_ADMIN_PASSWORD debe tener al menos 12 caracteres',
    );
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const identities = await prisma.$queryRawUnsafe<DatabaseIdentity[]>(
      `SELECT current_database() AS "databaseName",
              COALESCE(inet_server_addr()::text, '') AS "serverAddress"`,
    );
    const identity = identities[0];
    if (
      identity?.databaseName !== 'bentoo_lab' &&
      identity?.databaseName !== 'bentoo_ci'
    ) {
      throw new Error('El seed se negó a operar fuera de bentoo_lab/bentoo_ci');
    }

    let role = await prisma.role.findFirst({
      where: { restaurantId: null, name: 'SUPER_ADMIN' },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          restaurantId: null,
          name: 'SUPER_ADMIN',
          permissions: ['all', 'super_admin'],
          color: '#000000',
          isSystemRole: true,
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findFirst({
      where: { email, restaurantId: null },
    });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            roleId: role.id,
            password: passwordHash,
            isActive: true,
            emailVerifiedAt: new Date(),
          },
        })
      : await prisma.user.create({
          data: {
            email,
            password: passwordHash,
            name: 'Administrador Bentoo Lab',
            restaurantId: null,
            roleId: role.id,
            isActive: true,
            emailVerifiedAt: new Date(),
          },
        });

    return { userId: user.id, email: user.email };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  seedLabAdmin()
    .then(({ email }) => {
      process.stdout.write(`[Bentoo Lab] Super-admin listo: ${email}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[Bentoo Lab] Seed falló: ${message}\n`);
      process.exitCode = 1;
    });
}
