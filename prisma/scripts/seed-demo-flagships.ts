/**
 * Seed flagship demos: DemoExample + Prisma tenant from story profiles.
 *
 * Usage:
 *   npm run seed:demo-flagships
 *   npm run seed:demo-flagships -- --fresh
 *   npm run seed:demo-flagships -- --slug=la-parrilla
 *   npm run seed:demo-flagships -- --examples-only
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import {
  buildDemoWorld,
  FLAGSHIP_DEMO_SLUGS,
  getFlagshipProfile,
  listFlagshipProfiles,
  materializeDemoTenant,
  upsertDemoExample,
  type FlagshipDemoSlug,
} from '../../src/demo-world'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const fresh = process.argv.includes('--fresh')
const examplesOnly = process.argv.includes('--examples-only')
const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1] as
  | FlagshipDemoSlug
  | undefined

async function main() {
  const profiles = slugArg
    ? [getFlagshipProfile(slugArg)]
    : listFlagshipProfiles()

  console.log(
    `🌱 Sembrando ${profiles.length} flagship(s)${fresh ? ' (fresh)' : ''}${
      examplesOnly ? ' [examples-only]' : ''
    }...`,
  )

  for (const profile of profiles) {
    if (!FLAGSHIP_DEMO_SLUGS.includes(profile.slug)) continue
    const world = buildDemoWorld(profile)
    const top = world.analytics.topDishes[0]?.dishName ?? '(sin datos)'
    console.log(`\n→ ${profile.name} (${profile.slug})`)
    console.log(`  Hit esperado / top analytics: ${profile.hits[0]} / ${top}`)
    console.log(
      `  Pedidos generados: ${world.orders.length} | Clientes: ${world.customers.length}`,
    )

    const example = await upsertDemoExample(prisma, world)
    console.log(`  DemoExample upsert: ${example.slug}`)

    if (!examplesOnly) {
      const tenant = await materializeDemoTenant(prisma, world, { fresh })
      console.log(`  Tenant materializado: ${tenant.slug} (${tenant.restaurantId})`)
      console.log(`  Guardrail: isIndexable=false, demoShowcase=true`)
    }
  }

  console.log('\n✅ Flagships listos.')
  console.log('   Hub: /demo')
  console.log('   Ejemplos: /demo/la-parrilla | /demo/cafe-central | /demo/burger-lab | /demo/pizza-artesanal | /demo/sushi-express')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
