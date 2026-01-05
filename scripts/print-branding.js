const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
(async () => {
  let raw = process.env.DATABASE_URL || '';
  if (!raw) {
    try {
      const fs = require('fs');
      const env = fs.readFileSync('./.env', 'utf8');
      const m = env.match(/^DATABASE_URL=(.*)$/m);
      if (m) raw = m[1].trim();
    } catch (e) {
      // ignore
    }
  }
  const conn = raw.trim().replace(/^"|"$/g, '');
  const pool = new Pool({ connectionString: conn });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const id = process.argv[2] || 'cmjkjhyck0000rcdkcgotagn6';
    const r = await prisma.restaurant.findUnique({ where: { id } });
    if (!r) {
      console.error('Restaurant not found:', id);
      process.exit(2);
    }
    console.log('branding (raw):', JSON.stringify(r.branding, null, 2));
    console.log(
      'typeof hero.overlayOpacity:',
      typeof r.branding?.hero?.overlayOpacity,
    );
    console.log('hero.overlayOpacity value:', r.branding?.hero?.overlayOpacity);
    console.log('typeof hero.textShadow:', typeof r.branding?.hero?.textShadow);
    console.log('hero.textShadow value:', r.branding?.hero?.textShadow);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
