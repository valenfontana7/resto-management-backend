# 📋 Builder Configuration - Complete Data Model

> **Última actualización:** 5 de febrero de 2026  
> **Versión:** 1.0.0 (Website Builder)

Este archivo define la estructura completa de datos para almacenar todas las configuraciones del Website Builder.

**Organización:**

1. Theme Global (colores, tipografía, espaciado, animaciones)
2. Layout & Structure (estructura de página)
3. Assets (imágenes, logos, íconos)
4. Sections (configuración por sección)
5. SEO & Meta
6. Advanced (animaciones, efectos, PWA)

---

## 📦 Modelo Restaurant (Base de Datos)

```typescript
interface Restaurant {
  // ==================== Identificación ====================
  id: string; // CUID único
  slug: string; // URL-friendly, único (ej: "mi-restaurante")
  status: RestaurantStatus; // ACTIVE | INACTIVE | SUSPENDED | PENDING_VERIFICATION

  // ==================== Información Básica ====================
  name: string; // Nombre del restaurante
  type: string; // Tipo (ej: "restaurant", "cafe", "bar")
  cuisineTypes: string[]; // Tipos de cocina (ej: ["italiana", "mexicana"])
  description?: string; // Descripción del restaurante

  // ==================== Assets (Legacy - usar branding.assets) ====================
  logo?: string; // URL del logo
  coverImage?: string; // URL de imagen de portada

  // ==================== Contacto ====================
  email: string; // Email de contacto
  phone: string; // Teléfono de contacto
  website?: string; // Sitio web

  // ==================== Ubicación ====================
  address: string; // Dirección completa
  city: string; // Ciudad
  country: string; // País
  postalCode?: string; // Código postal

  // ==================== Configuración de Pedidos ====================
  minOrderAmount: number; // Monto mínimo en centavos (default: 1000 = $10)
  orderLeadTime: number; // Tiempo de preparación en minutos (default: 30)
  taxId?: string; // ID fiscal / RFC / CUIT

  // ==================== Campos JSON ====================
  branding?: BuilderConfiguration; // ⭐ Configuración del Website Builder (estructura completa abajo)
  features?: RestaurantFeatures; // Características habilitadas
  socialMedia?: SocialMedia; // Redes sociales
  businessRules?: BusinessRules; // Reglas de negocio
  legalDetails?: LegalDetails; // Detalles legales

  // ==================== Metadata ====================
  verificationStatus: VerificationStatus; // UNVERIFIED | PENDING | VERIFIED | REJECTED
  modulesUpdatedAt?: Date; // Última actualización de módulos
  modulesUpdatedBy?: string; // Quién actualizó los módulos
  createdAt: Date; // Fecha de creación
  updatedAt: Date; // Fecha de última actualización
}
```

---

## 🔧 Tipos Base

```typescript
// ==================== BASE TYPES ====================

type ColorValue = string; // Hex, RGB, RGBA
type ImageUrl = string | null;
type FontFamily = string;
type SizeValue = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
type SpacingValue = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type BorderRadiusValue = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
type ShadowValue = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type AlignmentValue = 'left' | 'center' | 'right' | 'justify';
type PositionValue = 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
```

---

## 🎨 Theme Configuration

### ThemeColors (15 propiedades)

```typescript
interface ThemeColors {
  // Primary brand colors
  primary: ColorValue;
  primaryText?: ColorValue;
  primaryHover?: ColorValue;

  // Secondary colors
  secondary?: ColorValue;
  secondaryText?: ColorValue;
  secondaryHover?: ColorValue;

  // Accent colors
  accent?: ColorValue;
  accentText?: ColorValue;
  accentHover?: ColorValue;

  // Neutral colors
  background?: ColorValue;
  foreground?: ColorValue;
  text?: ColorValue;
  textSecondary?: ColorValue;

  // UI colors
  border?: ColorValue;
  muted?: ColorValue;
  mutedForeground?: ColorValue;

  // Semantic colors
  success?: ColorValue;
  warning?: ColorValue;
  error?: ColorValue;
  info?: ColorValue;

  // Interactive states
  hover?: ColorValue;
  active?: ColorValue;
  focus?: ColorValue;
  disabled?: ColorValue;
}
```

### ThemeTypography (11 propiedades)

```typescript
interface ThemeTypography {
  // Font families
  fontFamily: FontFamily;
  headingFontFamily?: FontFamily;
  monoFontFamily?: FontFamily;

  // Font sizes (base scale)
  fontSize?: SizeValue;
  headingScale?: number; // Multiplicador para headings (default: 1.25)

  // Font weights
  fontWeightNormal?: number;
  fontWeightMedium?: number;
  fontWeightSemibold?: number;
  fontWeightBold?: number;

  // Line heights
  lineHeightTight?: number;
  lineHeightNormal?: number;
  lineHeightRelaxed?: number;

  // Letter spacing
  letterSpacingTight?: string;
  letterSpacingNormal?: string;
  letterSpacingWide?: string;
}
```

### ThemeSpacing (7 propiedades)

```typescript
interface ThemeSpacing {
  // Border radius
  borderRadius: BorderRadiusValue;
  borderRadiusButton?: BorderRadiusValue;
  borderRadiusCard?: BorderRadiusValue;
  borderRadiusInput?: BorderRadiusValue;

  // Shadows
  cardShadow: boolean;
  shadowSize?: ShadowValue;
  shadowColor?: ColorValue;

  // Padding & Margin scales
  spacingScale?: number; // Base spacing multiplier (default: 4px)
  containerPadding?: SpacingValue;
  sectionPadding?: SpacingValue;

  // Gaps
  gapSmall?: SpacingValue;
  gapMedium?: SpacingValue;
  gapLarge?: SpacingValue;
}
```

### ThemeAnimations

```typescript
interface ThemeAnimations {
  // Enable/disable animations
  enabled: boolean;

  // Transition durations (ms)
  durationFast?: number;
  durationNormal?: number;
  durationSlow?: number;

  // Easing functions
  easingDefault?: string;
  easingIn?: string;
  easingOut?: string;
  easingInOut?: string;

  // Specific animations
  hoverEffect?: 'none' | 'lift' | 'scale' | 'glow' | 'rotate';
  pageTransition?: 'none' | 'fade' | 'slide' | 'zoom';
  scrollReveal?: boolean;
}
```

### ThemeConfig (Combinado)

```typescript
interface ThemeConfig {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  animations?: ThemeAnimations;
}
```

---

## 🖼️ Assets Configuration (10 propiedades)

```typescript
interface AssetsConfig {
  // Logos
  logo?: ImageUrl;
  logoLight?: ImageUrl; // Logo for dark backgrounds
  logoDark?: ImageUrl; // Logo for light backgrounds
  logoMobile?: ImageUrl;

  // Favicons
  favicon?: ImageUrl;
  appleTouchIcon?: ImageUrl;

  // Hero/Banner images
  coverImage?: ImageUrl;
  bannerImage?: ImageUrl;
  heroBackgroundImage?: ImageUrl;

  // Background patterns/textures
  backgroundPattern?: ImageUrl;
  backgroundTexture?: ImageUrl;

  // Placeholder images
  defaultProductImage?: ImageUrl;
  defaultCategoryImage?: ImageUrl;

  // Icons
  customIcons?: Record<string, ImageUrl>;
}
```

---

## 📐 Layout Configuration (13 propiedades)

```typescript
interface LayoutConfig {
  // Page structure
  maxWidth: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  containerMaxWidth?: string; // Custom value (e.g., "1400px")

  // Menu layout
  menuStyle: 'grid' | 'list' | 'masonry' | 'carousel';
  menuColumns?: 1 | 2 | 3 | 4 | 5 | 6;
  menuGap?: SpacingValue;

  // Category display
  categoryDisplay: 'tabs' | 'pills' | 'dropdown' | 'sidebar' | 'accordion';
  categoryPosition?: 'top' | 'left' | 'right';

  // Section visibility
  showHeroSection: boolean;
  showStatsSection?: boolean;
  showHighlightsSection?: boolean;
  showTestimonialsSection?: boolean;
  showFeaturesSection?: boolean;
  showGallerySection?: boolean;

  // Layout modes
  compactMode: boolean;
  stickyHeader?: boolean;
  stickyCart?: boolean;

  // Responsive breakpoints (optional custom)
  breakpoints?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    wide?: number;
  };
}
```

---

## 🧩 Secciones Detalladas

### 🧭 Navigation Section (24 propiedades)

```typescript
interface NavigationConfig {
  // Position & Behavior
  position: PositionValue;
  sticky?: boolean;
  hideOnScroll?: boolean;

  // Styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  borderColor?: ColorValue;

  // Logo
  logoSize: 'sm' | 'md' | 'lg' | 'xl';
  logoPosition?: 'left' | 'center' | 'right';
  showLogo?: boolean;

  // Title & Branding
  titleColor?: ColorValue;
  titleSize?: SizeValue;
  showTitle?: boolean;
  showCuisineTypes?: boolean;
  cuisineTypesColor?: ColorValue;

  // Status indicators
  showOpenStatus: boolean;
  openStatusColor?: ColorValue;
  closedStatusColor?: ColorValue;

  // Buttons & Actions
  showContactButton: boolean;
  showCartButton?: boolean;
  showSearchButton?: boolean;
  showMenuButton?: boolean;
  buttonStyle?: 'text' | 'outlined' | 'filled';

  // Effects
  transparency?: boolean;
  blur?: boolean;
  blurAmount?: number;
  shadow?: boolean;
  shadowSize?: ShadowValue;
  borderBottom?: boolean;
  borderBottomWidth?: number;

  // Mobile menu
  mobileMenuStyle?: 'drawer' | 'fullscreen' | 'dropdown';
  mobileMenuPosition?: 'left' | 'right' | 'top' | 'bottom';

  // Height
  height?: number; // px
  mobileHeight?: number;
}
```

### 🎪 Hero Section (20+ propiedades)

```typescript
interface HeroConfig {
  // Visibility
  showSection: boolean;

  // Background
  backgroundColor?: ColorValue;
  backgroundImage?: ImageUrl;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  backgroundAttachment?: 'scroll' | 'fixed' | 'local';

  // Overlay
  overlayEnabled?: boolean;
  overlayColor?: ColorValue;
  overlayOpacity?: number; // 0-100
  overlayGradient?: string;

  // Dimensions
  height?: 'auto' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  minHeight?: string; // e.g., "500px", "60vh"
  maxHeight?: string;

  // Content alignment
  textAlign: AlignmentValue;
  contentPosition?: 'top' | 'center' | 'bottom';
  contentJustify?: 'start' | 'center' | 'end';

  // Title
  title?: {
    text?: string;
    color?: ColorValue;
    size?: SizeValue;
    weight?: number;
    shadow?: boolean;
    shadowColor?: ColorValue;
    animation?: 'none' | 'fade-in' | 'slide-up' | 'scale-in';
  };

  // Subtitle/Description
  subtitle?: {
    text?: string;
    color?: ColorValue;
    size?: SizeValue;
    weight?: number;
    shadow?: boolean;
  };

  // CTA Button
  ctaButton?: {
    enabled?: boolean;
    text?: string;
    href?: string;
    style?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: SizeValue;
    icon?: string;
  };

  // Secondary CTA
  secondaryCta?: {
    enabled?: boolean;
    text?: string;
    href?: string;
    style?: 'primary' | 'secondary' | 'outline' | 'ghost';
  };

  // Effects
  parallax?: boolean;
  kenBurns?: boolean; // Zoom animation on background
  particles?: boolean;

  // Meta information display
  showRating?: boolean;
  showDeliveryTime?: boolean;
  showPriceRange?: boolean;
  metaTextColor?: ColorValue;
}
```

### 🍽️ Menu Section (25+ propiedades)

```typescript
interface MenuConfig {
  // Section styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;

  // Title
  title?: {
    text?: string;
    color?: ColorValue;
    size?: SizeValue;
    align?: AlignmentValue;
  };

  // Subtitle
  subtitle?: {
    text?: string;
    color?: ColorValue;
  };

  // Card styling
  cardStyle: 'flat' | 'outlined' | 'elevated' | 'glass';
  cardBackgroundColor?: ColorValue;
  cardBorderColor?: ColorValue;
  cardBorderWidth?: number;
  cardShadow?: ShadowValue;
  cardHoverEffect?: 'lift' | 'scale' | 'glow' | 'none';

  // Spacing
  borderRadius?: BorderRadiusValue;
  itemSpacing?: SpacingValue;
  columns?: number; // Grid columns

  // Category tabs
  categoryTabStyle?: 'underline' | 'pills' | 'buttons' | 'minimal';
  categoryTabColor?: ColorValue;
  categoryTabActiveColor?: ColorValue;
  categoryTabActiveBackground?: ColorValue;

  // Product display
  showImages: boolean;
  imageAspectRatio?: '1:1' | '4:3' | '16:9' | '3:2';
  imagePosition?: 'top' | 'left' | 'right' | 'background';

  showPrices: boolean;
  priceSize?: SizeValue;
  priceColor?: ColorValue;

  showDescriptions?: boolean;
  descriptionLines?: number; // Line clamp

  showRatings?: boolean;
  showPreparationTime?: boolean;
  showCalories?: boolean;
  showDietaryInfo?: boolean;

  // Badges
  showBadges?: boolean;
  featuredBadgeColor?: ColorValue;
  newBadgeColor?: ColorValue;
  popularBadgeColor?: ColorValue;

  // Add to cart button
  addButtonStyle?: 'icon' | 'text' | 'icon-text';
  addButtonPosition?: 'bottom' | 'top-right' | 'center' | 'overlay';
  addButtonColor?: ColorValue;

  // Search & Filter
  showSearch?: boolean;
  showFilters?: boolean;
  filterPosition?: 'top' | 'sidebar';
}
```

### 📍 Info Section (12 propiedades)

```typescript
interface InfoSectionConfig {
  // Visibility
  showSection?: boolean;

  // Styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;

  // Layout
  layout?: 'cards' | 'columns' | 'accordion' | 'tabs';
  columns?: number;

  // Content blocks
  showLocation?: boolean;
  showHours?: boolean;
  showContact?: boolean;
  showMap?: boolean;

  // Map configuration
  mapStyle?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  mapZoom?: number;
  mapHeight?: string;

  // Icons
  iconColor?: ColorValue;
  iconSize?: SizeValue;
  iconStyle?: 'outline' | 'filled' | 'duotone';

  // Cards
  cardBackgroundColor?: ColorValue;
  cardBorderRadius?: BorderRadiusValue;
  cardShadow?: ShadowValue;
}
```

### 🦶 Footer Section (15 propiedades)

```typescript
interface FooterConfig {
  // Visibility
  showSection: boolean;

  // Styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  linkColor?: ColorValue;
  linkHoverColor?: ColorValue;
  borderTopColor?: ColorValue;

  // Layout
  layout?: 'simple' | 'detailed' | 'minimal' | 'mega';
  columns?: number;

  // Logo & Branding
  showLogo?: boolean;
  showDescription?: boolean;

  // Content sections
  showSocialLinks: boolean;
  showOpeningHours?: boolean;
  showBusinessInfo?: boolean;
  showQuickLinks?: boolean;
  showLegalLinks?: boolean;
  showNewsletter?: boolean;

  // Social links styling
  socialIconStyle?: 'circle' | 'square' | 'rounded' | 'minimal';
  socialIconSize?: SizeValue;
  socialIconColor?: ColorValue;

  // Copyright
  copyrightText?: string;
  copyrightColor?: ColorValue;
  showPoweredBy?: boolean;

  // Decorative elements
  showTopBorder?: boolean;
  showDecorations?: boolean;
}
```

### 🛒 Cart Section (15 propiedades)

```typescript
interface CartConfig {
  // Display style
  style: 'sidebar' | 'modal' | 'page' | 'drawer';
  position?: 'left' | 'right';

  // Styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  borderColor?: ColorValue;

  // Summary section
  summaryBackgroundColor?: ColorValue;
  summaryTextColor?: ColorValue;
  summaryBorderColor?: ColorValue;

  // Buttons
  checkoutButtonColor?: ColorValue;
  checkoutButtonText?: string;
  continueShoppingText?: string;
  buttonStyle?: 'rounded' | 'square' | 'pill';

  // Effects
  shadow?: ShadowValue;
  borderRadius?: BorderRadiusValue;
  blur?: boolean;

  // Empty state
  emptyStateIcon?: string;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  emptyStateButtonText?: string;

  // Item styling
  itemImageSize?: SizeValue;
  itemImageShape?: 'square' | 'rounded' | 'circle';
  showItemImages?: boolean;

  // Calculations display
  showSubtotal?: boolean;
  showTax?: boolean;
  showDeliveryFee?: boolean;
  showDiscounts?: boolean;
  showTip?: boolean;
}
```

### 📱 Mobile Menu

```typescript
interface MobileMenuConfig {
  // Styling
  backgroundColor?: ColorValue;
  textColor?: ColorValue;
  activeColor?: ColorValue;

  // Layout
  position?: 'left' | 'right' | 'top' | 'bottom';
  width?: string;

  // Items
  items?: Array<{
    label: string;
    href: string;
    icon?: string;
    enabled?: boolean;
    order?: number;
  }>;

  // Effects
  overlay?: boolean;
  overlayColor?: ColorValue;
  overlayOpacity?: number;
  animationType?: 'slide' | 'fade' | 'scale';
}
```

---

## 🔍 SEO & Meta Configuration

```typescript
interface SEOConfig {
  // Meta tags
  title?: string;
  description?: string;
  keywords?: string[];

  // Open Graph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: ImageUrl;
  ogType?: string;

  // Twitter Card
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: ImageUrl;

  // Schema.org
  schemaType?: 'Restaurant' | 'Cafe' | 'FoodEstablishment';
  schemaData?: Record<string, any>;

  // Additional
  canonicalUrl?: string;
  robots?: string;
  language?: string;
}
```

---

## ⚡ Advanced Configuration

```typescript
interface AdvancedConfig {
  // Custom CSS
  customCSS?: string;

  // Custom JavaScript
  customJS?: string;

  // Analytics
  googleAnalyticsId?: string;
  facebookPixelId?: string;
  customTrackingCode?: string;

  // Integrations
  chatWidget?: {
    enabled?: boolean;
    provider?: 'whatsapp' | 'messenger' | 'custom';
    config?: Record<string, any>;
  };

  // Performance
  lazyLoadImages?: boolean;
  enableCaching?: boolean;
  preloadFonts?: boolean;

  // Accessibility
  highContrast?: boolean;
  reducedMotion?: boolean;
  focusIndicators?: boolean;
  ariaLabels?: Record<string, string>;

  // PWA
  pwaEnabled?: boolean;
  pwaThemeColor?: ColorValue;
  pwaBackgroundColor?: ColorValue;

  // Experimental
  experimentalFeatures?: string[];
}
```

---

## 🏗️ Builder Configuration (Estructura Principal)

```typescript
interface BuilderConfiguration {
  // Version for migrations
  version: string; // e.g., "1.0.0"
  lastModified: string; // ISO date

  // Core configurations
  theme: ThemeConfig;
  layout: LayoutConfig;
  assets: AssetsConfig;

  // Section configurations
  sections: {
    nav: NavigationConfig;
    hero: HeroConfig;
    menu: MenuConfig;
    info: InfoSectionConfig;
    footer: FooterConfig;
    cart: CartConfig;
  };

  // Mobile
  mobileMenu?: MobileMenuConfig;

  // SEO
  seo?: SEOConfig;

  // Advanced
  advanced?: AdvancedConfig;

  // Metadata
  metadata?: {
    createdBy?: string;
    createdAt?: string;
    templateName?: string;
    tags?: string[];
    notes?: string;
  };
}
```

---

## 🎯 Valores por Defecto

```typescript
const DEFAULT_BUILDER_CONFIG: BuilderConfiguration = {
  version: '1.0.0',
  lastModified: new Date().toISOString(),

  theme: {
    colors: {
      primary: '#3b82f6',
      primaryText: '#ffffff',
      secondary: '#8b5cf6',
      accent: '#ec4899',
      background: '#ffffff',
      text: '#0f172a',
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 'md',
    },
    spacing: {
      borderRadius: 'md',
      cardShadow: true,
    },
  },

  layout: {
    maxWidth: 'xl',
    menuStyle: 'grid',
    categoryDisplay: 'tabs',
    showHeroSection: true,
    compactMode: false,
  },

  assets: {},

  sections: {
    nav: {
      position: 'sticky',
      sticky: true,
      logoSize: 'md',
      showOpenStatus: true,
      showContactButton: false,
      shadow: true,
    },

    hero: {
      showSection: true,
      height: 'lg',
      textAlign: 'center',
      overlayOpacity: 40,
    },

    menu: {
      cardStyle: 'elevated',
      showImages: true,
      showPrices: true,
      columns: 3,
    },

    info: {
      showSection: true,
      layout: 'cards',
    },

    footer: {
      showSection: true,
      showSocialLinks: true,
      layout: 'detailed',
    },

    cart: {
      style: 'sidebar',
      position: 'right',
    },
  },
};
```

---

## ⚙️ Campos JSON Adicionales del Restaurant

### Features (Características)

```typescript
interface RestaurantFeatures {
  delivery?: boolean; // Servicio de delivery
  takeaway?: boolean; // Para llevar
  dineIn?: boolean; // Comer en el local
  reservations?: boolean; // Reservaciones
  onlineOrdering?: boolean; // Pedidos online
  tableManagement?: boolean; // Gestión de mesas
  kitchenDisplay?: boolean; // Pantalla de cocina
  analytics?: boolean; // Analíticas
  multiLanguage?: boolean; // Multi-idioma
  loyaltyProgram?: boolean; // Programa de fidelidad
}
```

### Social Media

```typescript
interface SocialMedia {
  facebook?: string; // URL de Facebook
  instagram?: string; // URL de Instagram
  twitter?: string; // URL de Twitter/X
  tiktok?: string; // URL de TikTok
  youtube?: string; // URL de YouTube
  linkedin?: string; // URL de LinkedIn
  whatsapp?: string; // Número de WhatsApp
}
```

### Business Rules

```typescript
interface BusinessRules {
  autoAcceptOrders?: boolean; // Aceptar pedidos automáticamente
  autoConfirmReservations?: boolean; // Confirmar reservas automáticamente
  requirePhoneForOrders?: boolean; // Requerir teléfono en pedidos
  requireEmailForOrders?: boolean; // Requerir email en pedidos
  allowTips?: boolean; // Permitir propinas
  tipOptions?: number[]; // Opciones de propina [10, 15, 20]
  maxOrdersPerHour?: number; // Límite de pedidos por hora
  minAdvanceReservation?: number; // Minutos de anticipación para reservas
  maxAdvanceReservation?: number; // Máximo anticipación para reservas
}
```

### Business Hours

```typescript
interface BusinessHour {
  id: string;
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  isOpen: boolean; // Abierto ese día
  openTime: string; // Hora de apertura "09:00"
  closeTime: string; // Hora de cierre "22:00"
}
```

---

## 💾 Base de Datos Recomendada

### Schema PostgreSQL

```sql
CREATE TABLE restaurant_builder_configs (
  id UUID PRIMARY KEY,
  restaurant_id UUID UNIQUE NOT NULL,
  version VARCHAR(20) DEFAULT '1.0.0',
  config JSONB NOT NULL,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índice GIN para búsquedas JSON
CREATE INDEX idx_builder_config_json
  ON restaurant_builder_configs USING gin(config);
```

### Ejemplo de Registro

```json
{
  "id": "uuid-123",
  "restaurant_id": "restaurant-uuid",
  "version": "1.0.0",
  "config": {
    "version": "1.0.0",
    "lastModified": "2026-02-05T10:30:00Z",
    "theme": {
      "colors": {
        "primary": "#3b82f6",
        "secondary": "#8b5cf6"
      }
    },
    "sections": { "...": "..." }
  },
  "is_published": true,
  "created_at": "2026-02-05T10:00:00Z",
  "updated_at": "2026-02-05T10:30:00Z"
}
```

---

## 🔗 API Endpoints

### Endpoints Principales

```http
GET    /api/restaurants/:id/builder/config
Authorization: Bearer <token>

Response:
{
  "success": true,
  "config": { /* BuilderConfiguration */ }
}
```

```http
PATCH  /api/restaurants/:id/builder/config
Authorization: Bearer <token>
Content-Type: application/json

Body: { /* Partial BuilderConfiguration */ }
```

```http
PUT    /api/restaurants/:id/builder/config
Authorization: Bearer <token>
Content-Type: application/json

Body: { /* Full BuilderConfiguration */ }
```

```http
POST   /api/restaurants/:id/builder/publish
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Configuration published"
}
```

```http
GET    /api/restaurants/:id/builder/templates
Authorization: Bearer <token>

Response:
{
  "success": true,
  "templates": [ /* Template list */ ]
}
```

### Endpoints Granulares

```http
PATCH  /api/restaurants/:id/builder/theme
PATCH  /api/restaurants/:id/builder/layout
PATCH  /api/restaurants/:id/builder/assets
PATCH  /api/restaurants/:id/builder/sections/nav
PATCH  /api/restaurants/:id/builder/sections/hero
PATCH  /api/restaurants/:id/builder/sections/menu
PATCH  /api/restaurants/:id/builder/sections/info
PATCH  /api/restaurants/:id/builder/sections/footer
PATCH  /api/restaurants/:id/builder/sections/cart
PATCH  /api/restaurants/:id/builder/mobile-menu
PATCH  /api/restaurants/:id/builder/seo
PATCH  /api/restaurants/:id/builder/advanced
Authorization: Bearer <token>
Content-Type: application/json

Body: { /* Section-specific configuration */ }
```

---

## 📊 Resumen de Propiedades Configurables

| Categoría            | Propiedades | Descripción                             |
| -------------------- | ----------- | --------------------------------------- |
| **Theme Colors**     | 15          | Colores de marca, neutrales, semánticos |
| **Theme Typography** | 11          | Fuentes, tamaños, pesos, espaciado      |
| **Theme Spacing**    | 7           | Border radius, shadows, gaps            |
| **Theme Animations** | 10          | Transiciones, efectos, easing           |
| **Layout**           | 13          | Estructura de página, grid, visibilidad |
| **Assets**           | 10          | Logos, imágenes, íconos                 |
| **Navigation**       | 24          | Header, logo, botones, efectos          |
| **Hero**             | 20+         | Background, overlay, contenido, CTAs    |
| **Menu**             | 25+         | Cards, categorías, productos, filtros   |
| **Info**             | 12          | Ubicación, horarios, mapa               |
| **Footer**           | 15          | Links, social, copyright                |
| **Cart**             | 15          | Sidebar, resumen, botones               |
| **Mobile Menu**      | 10          | Items, animaciones, overlay             |
| **SEO**              | 15          | Meta tags, Open Graph, Schema           |
| **Advanced**         | 15+         | CSS, analytics, PWA, accesibilidad      |

**TOTAL: ~200+ propiedades configurables**

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Actualizar colores del tema

```typescript
await api.patch('/restaurants/abc123/builder/theme', {
  colors: {
    primary: '#FF6B35',
    secondary: '#004E89',
    accent: '#F4A259',
  },
});
```

### Ejemplo 2: Configurar navegación completa

```typescript
await api.patch('/restaurants/abc123/builder/sections/nav', {
  position: 'sticky',
  logoSize: 'lg',
  showOpenStatus: true,
  showContactButton: true,
  cuisineTypesColor: '#FF6B35',
  backgroundColor: '#ffffff',
  shadow: true,
  shadowSize: 'md',
  blur: true,
  blurAmount: 10,
});
```

### Ejemplo 3: Configurar Hero con overlay

```typescript
await api.patch('/restaurants/abc123/builder/sections/hero', {
  showSection: true,
  height: 'lg',
  textAlign: 'center',
  backgroundImage: 'https://cdn.example.com/hero.jpg',
  backgroundSize: 'cover',
  overlayEnabled: true,
  overlayColor: '#000000',
  overlayOpacity: 50,
  title: {
    color: '#ffffff',
    size: 'xl',
    shadow: true,
    animation: 'fade-in',
  },
  ctaButton: {
    enabled: true,
    text: 'Ver Menú',
    href: '/menu',
    style: 'primary',
    size: 'lg',
  },
});
```

### Ejemplo 4: Configuración completa del Builder

```typescript
await api.put('/restaurants/abc123/builder/config', {
  version: '1.0.0',
  lastModified: new Date().toISOString(),

  theme: {
    colors: {
      primary: '#3b82f6',
      primaryText: '#ffffff',
      secondary: '#8b5cf6',
      accent: '#ec4899',
      background: '#ffffff',
      text: '#1f2937',
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      headingFontFamily: 'Poppins, sans-serif',
      fontSize: 'md',
    },
    spacing: {
      borderRadius: 'lg',
      cardShadow: true,
      shadowSize: 'md',
    },
    animations: {
      enabled: true,
      hoverEffect: 'lift',
      pageTransition: 'fade',
      scrollReveal: true,
    },
  },

  layout: {
    maxWidth: 'xl',
    menuStyle: 'grid',
    menuColumns: 3,
    categoryDisplay: 'pills',
    showHeroSection: true,
    showTestimonialsSection: true,
    compactMode: false,
    stickyHeader: true,
  },

  assets: {
    logo: 'https://cdn.example.com/logo.png',
    favicon: 'https://cdn.example.com/favicon.ico',
    coverImage: 'https://cdn.example.com/cover.jpg',
  },

  sections: {
    nav: {
      position: 'sticky',
      logoSize: 'md',
      showOpenStatus: true,
      showContactButton: true,
      shadow: true,
    },
    hero: {
      showSection: true,
      height: 'lg',
      textAlign: 'center',
      overlayEnabled: true,
      overlayOpacity: 40,
    },
    menu: {
      cardStyle: 'elevated',
      showImages: true,
      showPrices: true,
      columns: 3,
      cardHoverEffect: 'lift',
    },
    info: {
      showSection: true,
      layout: 'cards',
      showMap: true,
    },
    footer: {
      showSection: true,
      showSocialLinks: true,
      layout: 'detailed',
    },
    cart: {
      style: 'sidebar',
      position: 'right',
    },
  },

  mobileMenu: {
    position: 'bottom',
    items: [
      { label: 'Inicio', href: '/', icon: 'home', enabled: true },
      { label: 'Menú', href: '/menu', icon: 'menu-book', enabled: true },
      {
        label: 'Reservar',
        href: '/reservations',
        icon: 'calendar',
        enabled: true,
      },
      {
        label: 'Llamar',
        href: 'tel:+1234567890',
        icon: 'phone',
        enabled: true,
      },
    ],
  },

  seo: {
    title: 'Mi Restaurante - Los mejores platos',
    description: 'Disfruta de la mejor comida en nuestra ciudad',
    ogImage: 'https://cdn.example.com/og-image.jpg',
  },

  advanced: {
    lazyLoadImages: true,
    pwaEnabled: true,
    pwaThemeColor: '#3b82f6',
  },
});
```

---

## 🔄 Deep Merge Behavior

El backend usa **deep merge** para actualizaciones parciales:

```typescript
// Estado actual:
{
  theme: {
    colors: { primary: '#3b82f6', secondary: '#8b5cf6' },
    typography: { fontFamily: 'Inter' }
  }
}

// PATCH enviado:
{
  theme: {
    colors: { primary: '#ff0000' }  // Solo cambiar primary
  }
}

// Resultado (NO se pierden otras propiedades):
{
  theme: {
    colors: { primary: '#ff0000', secondary: '#8b5cf6' },
    typography: { fontFamily: 'Inter' }
  }
}
```

---

## ✅ Validación

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

// Ejemplo de validación:
// - version es requerido
// - colors deben ser hex válidos (#RRGGBB)
// - URLs deben ser válidas
// - valores enum deben coincidir con opciones permitidas
```

---

## ⚠️ Notas Importantes

1. **Todos los campos son opcionales** (excepto `version`): Puedes enviar solo lo que quieras actualizar.

2. **Colores en formato hex**: Siempre usar formato `#RRGGBB` o `#RRGGBBAA` para transparencia.

3. **URLs válidas**: Los campos de URL deben ser URLs completas válidas (https://...).

4. **Version control**: El campo `version` permite migraciones futuras de la estructura.

5. **lastModified**: Se actualiza automáticamente en el backend.

6. **Assets legacy**: Los campos `restaurant.logo` y `restaurant.coverImage` siguen existiendo para compatibilidad.

7. **Deep merge**: Las actualizaciones parciales no eliminan campos existentes.

8. **Mobile menu hrefs**: Deben empezar con `/`, `http://`, `https://`, `tel:`, o `mailto:`.

---

## 📞 Soporte

Si tienes dudas sobre la estructura o necesitas campos adicionales, contacta al equipo de backend.

---

_Documento generado para sincronización Frontend-Backend_  
_Proyecto: Resto Management System - Website Builder_  
_Versión del documento: 1.0.0_
