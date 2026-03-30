import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter, log: ['query', 'info', 'warn', 'error'] });

async function main() {
  try {
    console.log("Intentando buscar role...");
    const role = await prisma.role.findFirst({
      where: { name: 'SUPER_ADMIN', restaurantId: null }
    });
    console.log("Encontrado:", role);
  } catch (e) {
    console.error("FULL ERROR:");
    console.error(e);
    if ((e as any).code) console.error("CODE:", (e as any).code);
    if ((e as any).meta) console.error("META:", (e as any).meta);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main();
