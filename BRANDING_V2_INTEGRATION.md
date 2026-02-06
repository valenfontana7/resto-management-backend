# 🚀 Instrucciones de Integración - Branding V2

## 📦 Paso 1: Agregar al Módulo

Actualizar `src/restaurants/restaurants.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantBrandingService } from './services/restaurant-branding.service';
import { RestaurantBrandingV2Service } from './services/restaurant-branding-v2.service'; // ← NUEVO
import { RestaurantBrandingV2Controller } from './controllers/restaurant-branding-v2.controller'; // ← NUEVO
// ... otros imports

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    EmailModule,
    // ... otros módulos
  ],
  controllers: [
    RestaurantsController,
    RestaurantBrandingV2Controller, // ← NUEVO
    // ... otros controladores
  ],
  providers: [
    RestaurantsService,
    RestaurantBrandingService,
    RestaurantBrandingV2Service, // ← NUEVO
    // ... otros providers
  ],
  exports: [
    RestaurantsService,
    RestaurantBrandingService,
    RestaurantBrandingV2Service, // ← NUEVO (opcional, si otros módulos lo necesitan)
  ],
})
export class RestaurantsModule {}
```

## 🧪 Paso 2: Testing Básico

### 2.1 Verificar Compilación

```bash
npm run build
```

No debe haber errores de TypeScript.

### 2.2 Iniciar Aplicación

```bash
npm run start:dev
```

### 2.3 Verificar Swagger

Abrir: `http://localhost:4000/api/docs`

Buscar la sección "Restaurant Branding V2" - debe mostrar todos los endpoints.

### 2.4 Test Manual con cURL

**1. Obtener branding actual:**

```bash
curl -X GET "http://localhost:4000/api/restaurants/{RESTAURANT_ID}/branding/v2" \
  -H "Authorization: Bearer {TOKEN}"
```

**2. Actualizar tema:**

```bash
curl -X PATCH "http://localhost:4000/api/restaurants/{RESTAURANT_ID}/branding/v2/theme" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "colors": {
      "primary": "#10b981"
    }
  }'
```

**3. Actualizar sección nav:**

```bash
curl -X PATCH "http://localhost:4000/api/restaurants/{RESTAURANT_ID}/branding/v2/sections/nav" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "logoSize": "lg",
    "sticky": true
  }'
```

**4. Migrar de V1 a V2:**

```bash
curl -X POST "http://localhost:4000/api/restaurants/{RESTAURANT_ID}/branding/migrate-to-v2" \
  -H "Authorization: Bearer {TOKEN}"
```

## 🗄️ Paso 3: Migración de Datos (Opcional)

Si quieres migrar todos los restaurantes existentes de V1 a V2:

### Opción A: Script de Migración Masiva

Crear `src/scripts/migrate-branding-v2.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { RestaurantBrandingV2Service } from '../restaurants/services/restaurant-branding-v2.service';

const prisma = new PrismaClient();

async function migrateAllRestaurants() {
  const brandingService = new RestaurantBrandingV2Service(prisma);

  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, branding: true },
  });

  console.log(`📊 Found ${restaurants.length} restaurants`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const restaurant of restaurants) {
    try {
      // Verificar si ya está en V2
      const branding = restaurant.branding as any;
      if (branding?.theme || branding?.sections || branding?.assets) {
        console.log(`⏭️  ${restaurant.name} - Already V2, skipping`);
        skipped++;
        continue;
      }

      // Migrar
      await brandingService.migrateFromV1(restaurant.id);
      console.log(`✅ ${restaurant.name} - Migrated successfully`);
      migrated++;
    } catch (error) {
      console.error(`❌ ${restaurant.name} - Error:`, error.message);
      errors++;
    }
  }

  console.log('\n📈 Migration Summary:');
  console.log(`✅ Migrated: ${migrated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total: ${restaurants.length}`);
}

migrateAllRestaurants()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Ejecutar:**

```bash
npx ts-node src/scripts/migrate-branding-v2.ts
```

### Opción B: Migración Bajo Demanda

Migrar restaurantes individualmente cuando accedan al panel de branding.

En el controlador de branding V1, agregar:

```typescript
@Get(':id/branding')
async getBranding(@VerifyRestaurantAccess('id') restaurantId: string) {
  const restaurant = await this.prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { branding: true },
  });

  const branding = restaurant.branding as any;

  // Auto-migrar si es V1
  if (branding && !branding.theme && !branding.sections && !branding.assets) {
    await this.brandingV2Service.migrateFromV1(restaurantId);
    // Re-fetch después de migrar
    const updated = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { branding: true },
    });
    return { success: true, branding: updated.branding };
  }

  return { success: true, branding };
}
```

## 📝 Paso 4: Actualizar Documentación API

Si usas Swagger/OpenAPI, la documentación se actualiza automáticamente gracias a los decoradores `@Api*`.

Verificar en: `http://localhost:4000/api/docs`

## 🎨 Paso 5: Frontend - Estructura Recomendada

### 5.1 Crear Types

```typescript
// types/branding.ts
export interface BrandingAssets {
  logo?: string;
  favicon?: string;
  coverImage?: string;
}

export interface ThemeColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
  muted?: string;
}

export interface BrandingTheme {
  colors?: ThemeColors;
  typography?: {
    fontFamily?: string;
    headingFontFamily?: string;
  };
  spacing?: {
    borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
    cardShadow?: boolean;
  };
}

export interface NavSection {
  logoSize?: 'sm' | 'md' | 'lg';
  showOpenStatus?: boolean;
  showContactButton?: boolean;
  cuisineTypesColor?: string;
  sticky?: boolean;
}

// ... más interfaces para otras secciones

export interface RestaurantBranding {
  assets?: BrandingAssets;
  theme?: BrandingTheme;
  layout?: {
    maxWidth?: string;
    showHeroSection?: boolean;
    showFeaturedDishes?: boolean;
    showTestimonials?: boolean;
  };
  sections?: {
    nav?: NavSection;
    hero?: HeroSection;
    menu?: MenuSection;
    // ... más secciones
  };
  mobileMenu?: MobileMenu;
  advanced?: {
    customCSS?: string;
    animations?: {
      enabled?: boolean;
      speed?: 'slow' | 'normal' | 'fast';
    };
  };
}
```

### 5.2 Crear Hook

```typescript
// hooks/useBranding.ts
import { useMemo } from 'react';
import { useRestaurant } from './useRestaurant';
import type { RestaurantBranding } from '@/types/branding';

export function useBranding() {
  const { restaurant } = useRestaurant();
  const branding = (restaurant?.branding as RestaurantBranding) || {};

  const getThemeColor = useMemo(() => {
    return (colorName: keyof ThemeColors, fallback = '#000000'): string => {
      return branding.theme?.colors?.[colorName] || fallback;
    };
  }, [branding.theme?.colors]);

  const getSectionConfig = useMemo(() => {
    return <T>(sectionName: string): T | {} => {
      return (branding.sections?.[sectionName] as T) || {};
    };
  }, [branding.sections]);

  const getColor = useMemo(() => {
    return (path: string, fallback?: string): string => {
      const parts = path.split('.');
      let value: any = branding;

      for (const part of parts) {
        value = value?.[part];
        if (value === undefined) break;
      }

      if (value && typeof value === 'string') return value;

      // Fallback a tema
      const colorKey = parts[parts.length - 1];
      return getThemeColor(colorKey as any, fallback);
    };
  }, [branding, getThemeColor]);

  return {
    branding,
    theme: branding.theme,
    assets: branding.assets,
    layout: branding.layout,
    sections: branding.sections,
    getThemeColor,
    getSectionConfig,
    getColor,
  };
}
```

### 5.3 Usar en Componentes

```typescript
// components/NavBar.tsx
import { useBranding } from '@/hooks/useBranding';

export function NavBar() {
  const { assets, getSectionConfig, getColor } = useBranding();
  const navConfig = getSectionConfig<NavSection>('nav');
  const cuisineTypesColor = getColor('sections.nav.cuisineTypesColor', '#6b7280');

  return (
    <nav className={navConfig.sticky ? 'sticky top-0 z-50' : ''}>
      <img
        src={assets?.logo}
        className={`logo-${navConfig.logoSize || 'md'}`}
        alt="Logo"
      />
      {navConfig.showOpenStatus && <OpenStatusBadge />}
      {navConfig.showContactButton && <ContactButton />}
      <div style={{ color: cuisineTypesColor }}>
        {restaurant.cuisineTypes.join(' • ')}
      </div>
    </nav>
  );
}
```

## 🧪 Paso 6: Testing Completo

### 6.1 Unit Tests (Backend)

```typescript
// restaurant-branding-v2.service.spec.ts
describe('RestaurantBrandingV2Service', () => {
  let service: RestaurantBrandingV2Service;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RestaurantBrandingV2Service, PrismaService],
    }).compile();

    service = module.get(RestaurantBrandingV2Service);
    prisma = module.get(PrismaService);
  });

  it('should merge branding correctly', async () => {
    // Test implementation
  });

  it('should migrate V1 to V2', async () => {
    // Test implementation
  });
});
```

### 6.2 E2E Tests (Frontend)

```typescript
describe('Branding V2', () => {
  it('should display theme colors correctly', () => {
    // Test implementation
  });

  it('should apply section overrides', () => {
    // Test implementation
  });

  it('should fallback to theme when no override', () => {
    // Test implementation
  });
});
```

## ✅ Checklist Final

### Backend

- [ ] Agregar servicio y controlador al módulo
- [ ] Verificar compilación sin errores
- [ ] Probar endpoints con cURL/Postman
- [ ] Verificar Swagger documentation
- [ ] (Opcional) Ejecutar script de migración
- [ ] Commit y push

### Frontend

- [ ] Crear types para branding
- [ ] Crear hook useBranding
- [ ] Actualizar componentes principales
- [ ] Implementar CSS variables
- [ ] Actualizar panel de administración
- [ ] Testing
- [ ] Commit y push

### Documentación

- [ ] Actualizar README
- [ ] Comunicar cambios al equipo
- [ ] (Opcional) Crear video tutorial

## 🚨 Troubleshooting

### Error: "Cannot find module branding-v2.dto"

**Solución:** Verificar que los archivos fueron creados en las rutas correctas y que el módulo fue compilado.

### Error: "brandingService is not defined"

**Solución:** Verificar que `RestaurantBrandingV2Service` está en el array de providers del módulo.

### Frontend muestra undefined

**Solución:** Verificar que el restaurante tiene branding. Ejecutar migración si es necesario.

### Colores no se aplican

**Solución:** Verificar que estás usando `getColor()` o `getThemeColor()` del hook, no accediendo directamente.

## 📞 Soporte

Para más información:

- **Schema completo**: `BRANDING_SCHEMA_V2.md`
- **Guía de migración**: `BRANDING_MIGRATION_GUIDE.md`
- **Resumen**: `BRANDING_V2_SUMMARY.md`
- **Este archivo**: `BRANDING_V2_INTEGRATION.md`
