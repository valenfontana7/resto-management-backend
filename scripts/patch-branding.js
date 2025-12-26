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
    } catch (e) {}
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
    const branding = r.branding || {};
    branding.hero = branding.hero || {};
    branding.layout = branding.layout || {};

    // Desired fixes (from latest frontend payload)
    branding.hero.overlayOpacity = 23;
    branding.hero.textShadow = true;
    branding.layout.showHeroSection = true;
    branding.layout.showStats = true;
    branding.layout.compactMode = false;

    await prisma.restaurant.update({ where: { id }, data: { branding } });
    console.log('Branding patched for', id);
    const updated = await prisma.restaurant.findUnique({ where: { id } });
    console.log('updated branding:', JSON.stringify(updated.branding, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
