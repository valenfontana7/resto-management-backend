import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script para migrar branding V1 a V2 en todos los restaurantes
 *
 * Ejecutar con: npx ts-node scripts/migrate-branding-to-v2.ts
 */
async function migrateAllRestaurantsBranding() {
  console.log('🚀 Iniciando migración de branding V1 → V2\n');

  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        branding: true,
      },
    });

    console.log(`📊 Encontrados ${restaurants.length} restaurantes\n`);

    let migrated = 0;
    let alreadyV2 = 0;
    let nobranding = 0;
    let errors = 0;

    for (const restaurant of restaurants) {
      try {
        const branding = restaurant.branding as any;

        // Verificar si no tiene branding
        if (!branding || Object.keys(branding).length === 0) {
          console.log(
            `⚪ ${restaurant.name} (${restaurant.slug}) - Sin branding`,
          );
          nobranding++;
          continue;
        }

        // Verificar si ya está en V2
        if (branding.theme || branding.sections || branding.assets) {
          console.log(
            `✅ ${restaurant.name} (${restaurant.slug}) - Ya está en V2`,
          );
          alreadyV2++;
          continue;
        }

        // Migrar de V1 a V2
        const v2Branding = migrateV1ToV2(branding);

        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: {
            branding: v2Branding,
            updatedAt: new Date(),
          },
        });

        console.log(
          `🔄 ${restaurant.name} (${restaurant.slug}) - Migrado exitosamente`,
        );
        migrated++;
      } catch (error) {
        console.error(
          `❌ ${restaurant.name} (${restaurant.slug}) - Error:`,
          error.message,
        );
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 RESUMEN DE MIGRACIÓN:');
    console.log('='.repeat(60));
    console.log(`✅ Migrados exitosamente:     ${migrated}`);
    console.log(`⏭️  Ya estaban en V2:         ${alreadyV2}`);
    console.log(`⚪ Sin branding:              ${nobranding}`);
    console.log(`❌ Errores:                   ${errors}`);
    console.log(`📊 Total procesados:          ${restaurants.length}`);
    console.log('='.repeat(60) + '\n');

    if (migrated > 0) {
      console.log('✨ Migración completada con éxito!');
    } else if (alreadyV2 === restaurants.length) {
      console.log('ℹ️  Todos los restaurantes ya están en V2');
    }
  } catch (error) {
    console.error('💥 Error fatal durante la migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Convierte branding V1 a V2
 */
function migrateV1ToV2(v1Branding: any): any {
  const v2Branding: any = {
    assets: {},
    theme: {
      colors: {},
      typography: {},
      spacing: {},
    },
    sections: {},
  };

  // Migrar assets
  if (v1Branding.logo) {
    v2Branding.assets.logo = v1Branding.logo;
  }
  if (v1Branding.favicon) {
    v2Branding.assets.favicon = v1Branding.favicon;
  }
  if (v1Branding.coverImage) {
    v2Branding.assets.coverImage = v1Branding.coverImage;
  }
  if (v1Branding.bannerImage) {
    v2Branding.assets.coverImage = v1Branding.bannerImage;
  }

  // Migrar colores globales al tema
  if (v1Branding.colors) {
    v2Branding.theme.colors = { ...v1Branding.colors };
  }

  // Migrar layout
  if (v1Branding.layout) {
    v2Branding.layout = { ...v1Branding.layout };
  }

  // Migrar secciones
  if (v1Branding.sections) {
    // Si ya tiene estructura sections, mantenerla
    v2Branding.sections = { ...v1Branding.sections };
  } else {
    // Migrar secciones individuales de V1
    if (v1Branding.nav) {
      v2Branding.sections.nav = { ...v1Branding.nav };
    }
    if (v1Branding.hero) {
      v2Branding.sections.hero = { ...v1Branding.hero };
    }
    if (v1Branding.menu) {
      v2Branding.sections.menu = { ...v1Branding.menu };
    }
    if (v1Branding.cart) {
      v2Branding.sections.cart = { ...v1Branding.cart };
    }
    if (v1Branding.footer) {
      v2Branding.sections.footer = { ...v1Branding.footer };
    }
    if (v1Branding.checkout) {
      v2Branding.sections.checkout = { ...v1Branding.checkout };
    }
    if (v1Branding.reservations) {
      v2Branding.sections.reservations = { ...v1Branding.reservations };
    }
  }

  // Migrar mobile menu
  if (v1Branding.mobileMenu) {
    v2Branding.mobileMenu = { ...v1Branding.mobileMenu };
  }

  // Limpiar objetos vacíos
  if (Object.keys(v2Branding.assets).length === 0) {
    delete v2Branding.assets;
  }
  if (Object.keys(v2Branding.theme.colors).length === 0) {
    delete v2Branding.theme.colors;
  }
  if (Object.keys(v2Branding.theme.typography).length === 0) {
    delete v2Branding.theme.typography;
  }
  if (Object.keys(v2Branding.theme.spacing).length === 0) {
    delete v2Branding.theme.spacing;
  }
  if (Object.keys(v2Branding.theme).length === 0) {
    delete v2Branding.theme;
  }
  if (Object.keys(v2Branding.sections).length === 0) {
    delete v2Branding.sections;
  }

  return v2Branding;
}

// Ejecutar migración
migrateAllRestaurantsBranding()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script falló:', error);
    process.exit(1);
  });
