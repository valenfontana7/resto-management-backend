# 🎨 Branding Schema V2 - Estructura Mejorada

## 📋 Filosofía del Diseño

**Principios clave:**

1. **Single Source of Truth**: Cada configuración vive en un solo lugar
2. **Separación de Responsabilidades**: Assets, tema global y configuraciones por sección están separados
3. **Escalabilidad**: Fácil agregar nuevas secciones sin afectar las existentes
4. **Herencia de Tema**: Las secciones heredan del tema global, pueden sobreescribir localmente
5. **DRY (Don't Repeat Yourself)**: Sin duplicación de configuraciones

## 🏗️ Estructura Completa

```typescript
interface RestaurantBranding {
  // 1. Assets - Recursos visuales del restaurante
  assets?: {
    logo?: string; // URL del logo
    favicon?: string; // URL del favicon
    coverImage?: string; // URL de imagen de portada/hero
  };

  // 2. Theme - Tema global (única fuente de verdad)
  theme?: {
    // Paleta de colores principal
    colors?: {
      primary?: string; // Color primario (#RRGGBB)
      secondary?: string; // Color secundario
      accent?: string; // Color de acento
      background?: string; // Color de fondo global
      text?: string; // Color de texto global
      muted?: string; // Color de texto secundario/muted
    };

    // Tipografía global
    typography?: {
      fontFamily?: string; // Familia de fuente
      headingFontFamily?: string; // Fuente para headings
    };

    // Espaciado y forma global
    spacing?: {
      borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl'; // Radio de bordes global
      cardShadow?: boolean; // Sombras globales
    };
  };

  // 3. Layout - Configuración de estructura general
  layout?: {
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'; // Ancho máximo del contenido
    showHeroSection?: boolean; // Mostrar sección hero
    showFeaturedDishes?: boolean; // Mostrar platos destacados
    showTestimonials?: boolean; // Mostrar testimonios
  };

  // 4. Sections - Configuraciones específicas por sección
  sections?: {
    // Header/Navegación
    nav?: {
      logoSize?: 'sm' | 'md' | 'lg';
      showOpenStatus?: boolean;
      showContactButton?: boolean;
      cuisineTypesColor?: string; // Override del color del tema
      sticky?: boolean; // Nav fijo al scroll
    };

    // Hero/Banner principal
    hero?: {
      minHeight?: 'sm' | 'md' | 'lg' | 'xl';
      textAlign?: 'left' | 'center' | 'right';
      textShadow?: boolean;
      overlay?: {
        enabled?: boolean;
        color?: string; // Override del color del tema
        opacity?: number; // 0-100
      };
      title?: {
        color?: string; // Override del color del tema
        size?: 'sm' | 'md' | 'lg' | 'xl';
      };
      description?: {
        color?: string; // Override del color del tema
      };
      meta?: {
        color?: string; // Override (ej: tipos de cocina)
      };
    };

    // Menú de platos
    menu?: {
      layout?: 'grid' | 'list';
      columns?: 1 | 2 | 3 | 4;
      showImages?: boolean;
      showPrices?: boolean;
      cardStyle?: {
        shadow?: boolean; // Override del shadow global
        borderRadius?: string; // Override del borderRadius global
        hoverEffect?: boolean;
      };
    };

    // Carrito de compras
    cart?: {
      position?: 'fixed' | 'sticky' | 'inline';
      location?: 'right' | 'left'; // Si es fixed/sticky
      shadow?: boolean;
      borderRadius?: string;
    };

    // Footer
    footer?: {
      showSocialLinks?: boolean;
      showBusinessInfo?: boolean;
      showOpeningHours?: boolean;
      layout?: 'simple' | 'detailed';
    };

    // Checkout
    checkout?: {
      layout?: 'single-page' | 'multi-step';
      buttonStyle?: 'solid' | 'outline' | 'ghost';
      showOrderSummary?: boolean;
    };

    // Reservaciones
    reservations?: {
      formStyle?: 'minimal' | 'card' | 'full';
      showAvailability?: boolean;
      requireDeposit?: boolean;
    };
  };

  // 5. Mobile Menu - Configuración específica para móviles
  mobileMenu?: {
    style?: {
      backgroundColor?: string;
      textColor?: string;
      position?: 'bottom' | 'top';
    };
    items?: Array<{
      label: string;
      href: string;
      icon?: string;
      enabled?: boolean;
    }>;
  };

  // 6. Advanced - Configuraciones avanzadas
  advanced?: {
    customCSS?: string; // CSS personalizado
    animations?: {
      enabled?: boolean;
      speed?: 'slow' | 'normal' | 'fast';
    };
  };
}
```

## 🎯 Ejemplo Completo

```json
{
  "branding": {
    "assets": {
      "logo": "https://storage.com/logo.png",
      "favicon": "https://storage.com/favicon.ico",
      "coverImage": "https://storage.com/hero.jpg"
    },

    "theme": {
      "colors": {
        "primary": "#3b82f6",
        "secondary": "#8b5cf6",
        "accent": "#ec4899",
        "background": "#ffffff",
        "text": "#1f2937",
        "muted": "#6b7280"
      },
      "typography": {
        "fontFamily": "Inter, sans-serif",
        "headingFontFamily": "Poppins, sans-serif"
      },
      "spacing": {
        "borderRadius": "md",
        "cardShadow": true
      }
    },

    "layout": {
      "maxWidth": "xl",
      "showHeroSection": true,
      "showFeaturedDishes": true,
      "showTestimonials": false
    },

    "sections": {
      "nav": {
        "logoSize": "md",
        "showOpenStatus": true,
        "showContactButton": true,
        "cuisineTypesColor": "#6b7280",
        "sticky": true
      },

      "hero": {
        "minHeight": "lg",
        "textAlign": "center",
        "textShadow": true,
        "overlay": {
          "enabled": true,
          "color": "#000000",
          "opacity": 40
        },
        "title": {
          "color": "#ffffff",
          "size": "xl"
        }
      },

      "menu": {
        "layout": "grid",
        "columns": 3,
        "showImages": true,
        "showPrices": true,
        "cardStyle": {
          "hoverEffect": true
        }
      },

      "cart": {
        "position": "fixed",
        "location": "right"
      },

      "footer": {
        "showSocialLinks": true,
        "showBusinessInfo": true,
        "showOpeningHours": true,
        "layout": "detailed"
      }
    },

    "mobileMenu": {
      "style": {
        "position": "bottom"
      },
      "items": [
        {
          "label": "Inicio",
          "href": "/",
          "icon": "home",
          "enabled": true
        },
        {
          "label": "Menú",
          "href": "/menu",
          "icon": "menu",
          "enabled": true
        },
        {
          "label": "Reservar",
          "href": "/reservations",
          "icon": "calendar",
          "enabled": true
        }
      ]
    }
  }
}
```

## 🔄 Migración desde V1

### Mapeo de campos antiguos a nuevos:

**Colors (dispersos en secciones) → theme.colors**

```javascript
// ANTES (V1)
{
  colors: { primary: "#xxx" },
  hero: { titleColor: "#yyy", backgroundColor: "#zzz" },
  menu: { backgroundColor: "#aaa", textColor: "#bbb" }
}

// DESPUÉS (V2)
{
  theme: {
    colors: {
      primary: "#xxx",
      background: "#zzz"
    }
  },
  sections: {
    hero: {
      title: { color: "#yyy" }  // Solo override si difiere del tema
    },
    menu: {
      // Usa colores del tema automáticamente
    }
  }
}
```

**Assets (dispersos) → assets**

```javascript
// ANTES (V1)
{
  logo: "url",
  favicon: "url",
  coverImage: "url"
}

// DESPUÉS (V2)
{
  assets: {
    logo: "url",
    favicon: "url",
    coverImage: "url"
  }
}
```

## ✅ Ventajas de V2

1. **Menos duplicación**: Los colores se definen una vez en `theme.colors`
2. **Override selectivo**: Las secciones pueden sobreescribir el tema cuando sea necesario
3. **Más fácil de mantener**: Cambiar el tema afecta todo el sitio automáticamente
4. **Mejor organización**: Cada tipo de configuración tiene su lugar específico
5. **Escalabilidad**: Agregar nuevas secciones no afecta las existentes
6. **Tipado fuerte**: Estructura clara para TypeScript
7. **Defaults inteligentes**: Frontend puede aplicar valores del tema automáticamente

## 🚀 Endpoint API

**Actualizar branding completo:**

```http
PUT /api/restaurants/:id/branding
Content-Type: application/json

{
  "theme": {
    "colors": {
      "primary": "#3b82f6"
    }
  },
  "sections": {
    "nav": {
      "logoSize": "lg"
    }
  }
}
```

**Actualizar solo una sección:**

```http
PATCH /api/restaurants/:id/branding/sections/nav
Content-Type: application/json

{
  "logoSize": "lg",
  "sticky": true
}
```

## 📊 Comparación V1 vs V2

| Aspecto        | V1 (Actual)                 | V2 (Propuesto)                  |
| -------------- | --------------------------- | ------------------------------- |
| Colores        | Duplicados en cada sección  | Una paleta en `theme.colors`    |
| Assets         | Mezclados con configuración | Separados en `assets`           |
| Override       | No hay jerarquía clara      | Override explícito en secciones |
| Escalabilidad  | Difícil agregar secciones   | Muy fácil agregar secciones     |
| Mantenibilidad | Compleja                    | Simple y clara                  |
| Tamaño JSON    | Mayor (duplicación)         | Menor (DRY)                     |
| Defaults       | Frontend debe manejar todo  | Herencia automática del tema    |

## 🎓 Guía de Uso para Frontend

```typescript
// Obtener color para una sección
function getSectionColor(
  branding: RestaurantBranding,
  section: string,
  type: 'background' | 'text',
) {
  // 1. Intentar obtener override de la sección
  const sectionOverride = branding.sections?.[section]?.[`${type}Color`];
  if (sectionOverride) return sectionOverride;

  // 2. Usar color del tema global
  const themeColor = branding.theme?.colors?.[type];
  if (themeColor) return themeColor;

  // 3. Fallback a default del sistema
  return type === 'background' ? '#ffffff' : '#000000';
}

// Uso
const heroBackgroundColor = getSectionColor(branding, 'hero', 'background');
```
