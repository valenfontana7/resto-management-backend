const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
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
  const p = new PrismaClient({ adapter });
  try {
    const restaurantId = process.argv[2] || 'cmjkjhyck0000rcdkcgotagn6';
    const u = await p.user.findFirst({ where: { restaurantId } });
    if (!u) {
      console.error('no user found for restaurant', restaurantId);
      process.exit(2);
    }
    const secret =
      process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign(
      {
        sub: u.id,
        email: u.email,
        roleId: u.roleId || '',
        restaurantId: u.restaurantId || '',
      },
      secret,
    );
    console.log(token);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
