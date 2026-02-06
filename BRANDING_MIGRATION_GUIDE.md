# 🚀 Guía de Migración Branding V1 → V2

## 📋 Resumen Ejecutivo

La nueva estructura V2 de branding reorganiza las configuraciones para:

- ✅ **Eliminar duplicación**: Colores y estilos se definen una vez en el tema
- ✅ **Mejorar escalabilidad**: Fácil agregar nuevas secciones
- ✅ **Simplificar mantenimiento**: Cambios globales desde un solo lugar
- ✅ **Override granular**: Secciones pueden sobreescribir el tema cuando sea necesario

## 🔄 Estrategias de Migración

### Opción 1: Migración Automática (Recomendada)

**Endpoint automático que convierte V1 a V2:**

```bash
POST /api/restaurants/:id/branding/migrate-to-v2
Authorization: Bearer <token>
```

**Response:**

```json
{
  "success": true,
  "message": "Branding migrated from V1 to V2",
  "branding": {
    /* estructura V2 */
  }
}
```

### Opción 2: Migración Manual

Si prefieres control total sobre la migración.

## 📊 Mapeo de Campos V1 → V2

### Assets

```javascript
// V1
{
  "logo": "https://...",
  "favicon": "https://...",
  "coverImage": "https://..."
}

// V2
{
  "assets": {
    "logo": "https://...",
    "favicon": "https://...",
    "coverImage": "https://..."
  }
}
```

### Colores Globales

```javascript
// V1 - Colores repetidos en múltiples lugares
{
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#8b5cf6"
  },
  "hero": {
    "titleColor": "#ffffff",
    "backgroundColor": "#000000"
  },
  "menu": {
    "backgroundColor": "#f9fafb",
    "textColor": "#1f2937"
  }
}

// V2 - Tema global con overrides específicos
{
  "theme": {
    "colors": {
      "primary": "#3b82f6",
      "secondary": "#8b5cf6",
      "background": "#ffffff",
      "text": "#1f2937"
    }
  },
  "sections": {
    "hero": {
      "title": { "color": "#ffffff" },  // Override solo si difiere
      "overlay": { "color": "#000000", "opacity": 50 }
    },
    "menu": {
      // Usa colores del tema automáticamente
      // Solo override si necesitas colores específicos
    }
  }
}
```

### Secciones

```javascript
// V1 - Flat structure
{
  "nav": { /* config */ },
  "hero": { /* config */ },
  "menu": { /* config */ }
}

// V2 - Organized under sections
{
  "sections": {
    "nav": { /* config */ },
    "hero": { /* config */ },
    "menu": { /* config */ }
  }
}
```

## 🎯 Ejemplos de Uso

### Ejemplo 1: Actualizar Tema Completo

```bash
PATCH /api/restaurants/:id/branding/v2/theme
Content-Type: application/json
Authorization: Bearer <token>

{
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#8b5cf6",
    "accent": "#ec4899"
  },
  "typography": {
    "fontFamily": "Inter, sans-serif",
    "headingFontFamily": "Poppins, sans-serif"
  },
  "spacing": {
    "borderRadius": "lg",
    "cardShadow": true
  }
}
```

**Efecto:** Todos los componentes del sitio usarán estos colores automáticamente, a menos que tengan overrides específicos.

### Ejemplo 2: Actualizar Solo una Sección

```bash
PATCH /api/restaurants/:id/branding/v2/sections/nav
Content-Type: application/json
Authorization: Bearer <token>

{
  "logoSize": "lg",
  "showOpenStatus": true,
  "cuisineTypesColor": "#6b7280",
  "sticky": true
}
```

**Efecto:** Solo se actualiza la navegación, el resto del branding permanece igual.

### Ejemplo 3: Actualización Parcial del Hero

```bash
PATCH /api/restaurants/:id/branding/v2/sections/hero
Content-Type: application/json
Authorization: Bearer <token>

{
  "minHeight": "xl",
  "overlay": {
    "enabled": true,
    "color": "#000000",
    "opacity": 60
  },
  "title": {
    "color": "#ffffff",
    "size": "xl"
  }
}
```

### Ejemplo 4: Actualización Completa

```bash
PUT /api/restaurants/:id/branding/v2
Content-Type: application/json
Authorization: Bearer <token>

{
  "assets": {
    "logo": "https://storage.com/new-logo.png"
  },
  "theme": {
    "colors": {
      "primary": "#10b981"
    }
  },
  "sections": {
    "nav": {
      "logoSize": "lg"
    },
    "menu": {
      "layout": "grid",
      "columns": 4
    }
  }
}
```

**Nota:** Merge profundo - solo actualiza los campos enviados, mantiene el resto.

## 🔧 Implementación en Frontend

### Hook para Obtener Colores con Fallback

```typescript
// utils/branding.ts
export function getBrandingColor(
  branding: RestaurantBranding,
  path: string,
  fallback?: string,
): string {
  // Ejemplo: path = "sections.hero.title.color"
  const parts = path.split('.');
  let value: any = branding;

  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }

  if (value) return value;

  // Fallback a tema global
  const colorType = path.split('.').pop(); // "color", "backgroundColor", etc
  const themeColor =
    branding.theme?.colors?.[colorType] || branding.theme?.colors?.primary;

  return themeColor || fallback || '#000000';
}

// Uso
const heroTitleColor = getBrandingColor(
  branding,
  'sections.hero.title.color',
  '#ffffff',
);
```

### Hook de React

```typescript
// hooks/useBranding.ts
import { useRestaurant } from './useRestaurant';

export function useBranding() {
  const { restaurant } = useRestaurant();
  const branding = restaurant?.branding || {};

  const getColor = (path: string, fallback?: string) => {
    return getBrandingColor(branding, path, fallback);
  };

  const getThemeColor = (colorName: string) => {
    return branding.theme?.colors?.[colorName] || '#000000';
  };

  const getSectionConfig = (sectionName: string) => {
    return branding.sections?.[sectionName] || {};
  };

  return {
    branding,
    getColor,
    getThemeColor,
    getSectionConfig,
    theme: branding.theme,
    assets: branding.assets,
  };
}

// Uso en componente
function NavBar() {
  const { getSectionConfig, getColor, assets } = useBranding();
  const navConfig = getSectionConfig('nav');
  const cuisineTypesColor = getColor(
    'sections.nav.cuisineTypesColor',
    '#6b7280'
  );

  return (
    <nav className={navConfig.sticky ? 'sticky top-0' : ''}>
      <img
        src={assets?.logo}
        className={`logo-${navConfig.logoSize || 'md'}`}
      />
      {navConfig.showOpenStatus && <OpenStatusBadge />}
      <div style={{ color: cuisineTypesColor }}>
        {restaurant.cuisineTypes.join(' • ')}
      </div>
    </nav>
  );
}
```

### CSS Variables desde el Tema

```typescript
// App.tsx o layout principal
function App() {
  const { theme } = useBranding();

  useEffect(() => {
    if (theme?.colors) {
      document.documentElement.style.setProperty(
        '--color-primary',
        theme.colors.primary || '#3b82f6'
      );
      document.documentElement.style.setProperty(
        '--color-secondary',
        theme.colors.secondary || '#8b5cf6'
      );
      // ... más colores
    }

    if (theme?.typography) {
      document.documentElement.style.setProperty(
        '--font-family',
        theme.typography.fontFamily || 'Inter, sans-serif'
      );
    }
  }, [theme]);

  return <>{/* app content */}</>;
}
```

```css
/* globals.css */
.btn-primary {
  background-color: var(--color-primary);
}

.heading {
  font-family: var(--font-heading, var(--font-family));
}
```

## 📝 Checklist de Migración

### Backend

- [ ] Agregar `RestaurantBrandingV2Service` al módulo
- [ ] Agregar `RestaurantBrandingV2Controller` al módulo
- [ ] Ejecutar migración automática para todos los restaurantes
- [ ] Verificar que los datos migraron correctamente
- [ ] (Opcional) Mantener endpoints V1 por compatibilidad temporal

### Frontend

- [ ] Crear hook `useBranding()` con helpers
- [ ] Crear utilidades para obtener colores con fallback
- [ ] Actualizar componentes para usar nueva estructura
- [ ] Implementar CSS variables desde el tema
- [ ] Actualizar panel de administración (branding editor)
- [ ] Testing en diferentes restaurantes

### Testing

- [ ] Probar actualización de tema global
- [ ] Probar actualización de secciones individuales
- [ ] Probar overrides de colores
- [ ] Verificar fallbacks cuando no hay configuración
- [ ] Probar reseteo a defaults

## 🎨 Panel de Administración

### Estructura Sugerida del Editor

```
Branding
├── 🎨 Tema
│   ├── Colores
│   │   ├── Primario
│   │   ├── Secundario
│   │   ├── Acento
│   │   ├── Fondo
│   │   └── Texto
│   ├── Tipografía
│   │   ├── Familia de fuente
│   │   └── Fuente para títulos
│   └── Espaciado
│       ├── Radio de bordes
│       └── Sombras en cards
│
├── 📐 Layout
│   ├── Ancho máximo
│   ├── Mostrar hero
│   ├── Mostrar destacados
│   └── Mostrar testimonios
│
├── 🧩 Secciones
│   ├── Navegación
│   ├── Hero
│   ├── Menú
│   ├── Carrito
│   ├── Footer
│   ├── Checkout
│   └── Reservaciones
│
└── 📱 Menú Móvil
    ├── Estilo
    └── Items
```

## 🚨 Breaking Changes

### Si usabas V1 en frontend:

**ANTES (V1):**

```typescript
const primaryColor = branding.colors.primary;
const heroTitleColor = branding.hero.titleColor;
```

**DESPUÉS (V2):**

```typescript
const primaryColor = branding.theme.colors.primary;
const heroTitleColor =
  branding.sections.hero.title.color || branding.theme.colors.text;
```

**Solución:** Usar helpers para manejar fallbacks automáticamente.

## 💡 Tips y Mejores Prácticas

1. **Define colores globales en el tema** - Solo usa overrides cuando realmente necesites un color diferente

2. **Usa CSS variables** - Hace que cambios en el tema se reflejen instantáneamente sin re-render

3. **Valores por defecto sensatos** - El frontend debe tener buenos defaults para cuando no hay configuración

4. **Validación en el panel** - Valida colores hexadecimales y rangos numéricos antes de enviar

5. **Preview en tiempo real** - Muestra preview de cambios antes de guardar

6. **Versionado** - Considera guardar historial de cambios de branding

## 📞 Soporte

Si encuentras problemas durante la migración:

- Revisa la consola del navegador para errores
- Verifica que los endpoints V2 estén registrados
- Usa el endpoint de migración automática primero
- Consulta los ejemplos de este documento
