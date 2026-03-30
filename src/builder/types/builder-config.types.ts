/**
 * Builder Configuration - Complete Data Model
 *
 * Este archivo define la estructura completa de datos para almacenar
 * todas las configuraciones del Website Builder.
 *
 * Organización:
 * 1. Theme Global (colores, tipografía, espaciado)
 * 2. Layout & Structure (estructura de página)
 * 3. Assets (imágenes, logos, íconos)
 * 4. Sections (configuración por sección)
 * 5. Content (contenido editable)
 * 6. Advanced (animaciones, efectos, SEO)
 */

// ==================== BASE TYPES ====================

export type ColorValue = string; // Hex, RGB, RGBA
export type ImageUrl = string | null;
export type FontFamily = string;
export type SizeValue = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type SpacingValue = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type BorderRadiusValue = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type ShadowValue = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type AlignmentValue = 'left' | 'center' | 'right' | 'justify';
export type PositionValue =
  | 'static'
  | 'relative'
  | 'absolute'
  | 'fixed'
  | 'sticky';

// ==================== THEME CONFIGURATION ====================

export interface ThemeColors {
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

export interface ThemeTypography {
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

export interface ThemeSpacing {
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

export interface ThemeAnimations {
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

export interface ThemeConfig {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  animations?: ThemeAnimations;
}

// ==================== ASSETS CONFIGURATION ====================

export interface AssetsConfig {
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

// ==================== LAYOUT CONFIGURATION ====================

export interface LayoutConfig {
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

// ==================== NAVIGATION SECTION ====================

export interface NavigationConfig {
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

// ==================== HERO SECTION ====================

export interface HeroConfig {
  // Visibility
  showSection: boolean;

  // Background
  backgroundColor?: ColorValue;
  backgroundImage?: ImageUrl;
  backgroundSize?: 'cover' | 'contain' | 'auto';
  backgroundPosition?: string;
  backgroundAttachment?: 'scroll' | 'fixed' | 'local';

  // Overlay (nested, matches branding V2 format)
  overlay?: {
    enabled?: boolean;
    color?: ColorValue;
    opacity?: number; // 0-100
    gradient?: string;
  };

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
  meta?: {
    color?: ColorValue;
  };

  // Text effects
  textShadow?: boolean;
}

// ==================== MENU SECTION ====================

export interface MenuConfig {
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

// ==================== INFO SECTION ====================

export interface CuisineTypesStyleConfig {
  /** Color del texto del badge */
  color?: ColorValue;
  /** Color de fondo del badge */
  backgroundColor?: ColorValue;
  /** Tamaño del badge */
  size?: SizeValue;
  /** Radio de borde del badge */
  borderRadius?: BorderRadiusValue;
}

export interface InfoSectionConfig {
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

  // Cuisine type badges style
  cuisineTypesStyle?: CuisineTypesStyleConfig;
}

// ==================== FOOTER SECTION ====================

export interface FooterConfig {
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

// ==================== CART SECTION ====================

export interface CartConfig {
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

// ==================== MOBILE MENU ====================

export interface MobileMenuConfig {
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

// ==================== SEO & META ====================

export interface SEOConfig {
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

// ==================== ADVANCED FEATURES ====================

export interface AdvancedConfig {
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

// ==================== CHECKOUT SECTION ====================

export interface CheckoutConfig {
  layout?: 'single-page' | 'multi-step';
  buttonStyle?: 'solid' | 'outline' | 'ghost';
  showOrderSummary?: boolean;
}

// ==================== RESERVATIONS SECTION ====================

export interface ReservationsConfig {
  formStyle?: 'minimal' | 'card' | 'full';
  showAvailability?: boolean;
  requireDeposit?: boolean;
}

// ==================== RESTAURANT INFO (read-only, from Prisma) ====================

/**
 * Datos de identidad del restaurante PUBLICADOS (live).
 * Se leen SIEMPRE desde las columnas Prisma del modelo Restaurant.
 * Se inyectan en la respuesta del endpoint GET /builder/:id/config
 * para que el frontend pueda mostrar los valores actuales.
 */
export interface RestaurantInfo {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  cuisineTypes: string[];
  logo?: string;
  coverImage?: string;
  type?: string;
  website?: string;
  socialMedia?: Record<string, string>;
  isPublished?: boolean;
}

// ==================== RESTAURANT DRAFT (editable layer in builder) ====================

/**
 * Capa de borrador para datos de identidad del restaurante.
 * Se almacena dentro de BuilderConfig.config.restaurant.
 * Solo contiene los campos que el usuario ha modificado en el builder.
 * Al publicar, estos valores se aplican a las columnas Prisma del Restaurant.
 *
 * Frontend muestra: config.restaurant.name ?? restaurant.name
 */
export interface RestaurantDraft {
  name?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  cuisineTypes?: string[];
  logo?: string;
  coverImage?: string;
  type?: string;
  website?: string;
  socialMedia?: Record<string, string>;
}

// ==================== SECTIONS CONFIGURATION ====================

export interface SectionsConfig {
  nav: NavigationConfig;
  hero: HeroConfig;
  menu: MenuConfig;
  info: InfoSectionConfig;
  footer: FooterConfig;
  cart: CartConfig;
  checkout?: CheckoutConfig;
  reservations?: ReservationsConfig;
}

// ==================== MAIN BUILDER CONFIGURATION ====================

export interface BuilderConfiguration {
  // Version for migrations
  version: string; // e.g., "1.0.0"
  lastModified: string; // ISO date

  // Core configurations (same shape as branding V2)
  theme: ThemeConfig;
  layout: LayoutConfig;
  assets: AssetsConfig;

  // Section configurations (same shape as branding V2)
  sections: SectionsConfig;

  // Draft de datos del restaurante (se aplica a Prisma al publicar)
  restaurant?: RestaurantDraft;

  // Mobile
  mobileMenu?: MobileMenuConfig;

  // Advanced
  advanced?: AdvancedConfig;

  // Builder-only fields (not copied to branding)
  seo?: SEOConfig;
  metadata?: {
    createdBy?: string;
    createdAt?: string;
    templateName?: string;
    tags?: string[];
    notes?: string;
  };
}

/**
 * Respuesta del endpoint GET /builder/:id/config.
 * `config` contiene la configuración raw del builder.
 * `restaurant` contiene el estado efectivo de preview (live + draft).
 * `publishedRestaurant` conserva el estado publicado/live para referencia.
 */
export interface BuilderConfigResponse {
  config: BuilderConfiguration;
  restaurant: BuilderPreviewRestaurant;
  publishedRestaurant: RestaurantInfo;
}

export type BuilderPreviewBranding = Omit<
  BuilderConfiguration,
  'restaurant' | 'seo' | 'metadata' | 'version' | 'lastModified'
>;

export interface BuilderPreviewRestaurant extends RestaurantInfo {
  // Branding efectivo de preview para que el frontend no dependa de /restaurants/me.
  branding: BuilderPreviewBranding;
}

// ==================== DEFAULTS ====================

/**
 * Defaults unificados con el formato Branding V2.
 * Al publicar, estos valores se copian directamente a restaurant.branding.
 */
export const DEFAULT_BUILDER_CONFIG: BuilderConfiguration = {
  version: '1.0.0',
  lastModified: new Date().toISOString(),

  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      accent: '#ec4899',
      background: '#ffffff',
      text: '#1f2937',
      muted: '#6b7280',
    },
    typography: {
      fontFamily: 'Inter, sans-serif',
      headingFontFamily: 'Inter, sans-serif',
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
      logoSize: 'md',
      showOpenStatus: true,
      showContactButton: true,
      sticky: false,
    },

    hero: {
      showSection: true,
      minHeight: 'lg',
      textAlign: 'center',
      overlay: { enabled: false, opacity: 0 },
      textShadow: false,
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
      showBusinessInfo: true,
      showOpeningHours: true,
      layout: 'simple',
    },

    cart: {
      style: 'drawer',
      position: 'right',
    },

    checkout: {
      layout: 'single-page',
      buttonStyle: 'solid',
      showOrderSummary: true,
    },

    reservations: {
      formStyle: 'card',
      showAvailability: true,
      requireDeposit: false,
    },
  },
};

// ==================== HELPER TYPES ====================

export type BuilderConfigPath =
  | `theme.colors.${keyof ThemeColors}`
  | `theme.typography.${keyof ThemeTypography}`
  | `theme.spacing.${keyof ThemeSpacing}`
  | `layout.${keyof LayoutConfig}`
  | `sections.nav.${keyof NavigationConfig}`
  | `sections.hero.${keyof HeroConfig}`
  | `sections.menu.${keyof MenuConfig}`
  | `sections.footer.${keyof FooterConfig}`
  | `sections.cart.${keyof CartConfig}`;

export type BuilderConfigValue =
  | string
  | number
  | boolean
  | object
  | null
  | undefined;

// ==================== VALIDATION ====================

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function validateBuilderConfig(
  config: Partial<BuilderConfiguration>,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Version check
  if (!config.version) {
    errors.push({
      path: 'version',
      message: 'Version is required',
      severity: 'error',
    });
  }

  // Theme validation
  if (config.theme?.colors?.primary) {
    const hexRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
    if (!hexRegex.test(config.theme.colors.primary)) {
      errors.push({
        path: 'theme.colors.primary',
        message:
          'Primary color must be a valid hex color (#RRGGBB or #RRGGBBAA)',
        severity: 'error',
      });
    }
  }

  // Validate all color fields
  if (config.theme?.colors) {
    const hexRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
    const colorKeys = Object.keys(config.theme.colors) as (keyof ThemeColors)[];

    for (const key of colorKeys) {
      const value = config.theme.colors[key];
      if (value && typeof value === 'string' && !hexRegex.test(value)) {
        errors.push({
          path: `theme.colors.${key}`,
          message: `${key} must be a valid hex color`,
          severity: 'warning',
        });
      }
    }
  }

  // Layout validation
  if (config.layout) {
    const validMaxWidths = ['sm', 'md', 'lg', 'xl', '2xl', 'full'];
    if (
      config.layout.maxWidth &&
      !validMaxWidths.includes(config.layout.maxWidth)
    ) {
      errors.push({
        path: 'layout.maxWidth',
        message: `maxWidth must be one of: ${validMaxWidths.join(', ')}`,
        severity: 'error',
      });
    }

    const validMenuStyles = ['grid', 'list', 'masonry', 'carousel'];
    if (
      config.layout.menuStyle &&
      !validMenuStyles.includes(config.layout.menuStyle)
    ) {
      errors.push({
        path: 'layout.menuStyle',
        message: `menuStyle must be one of: ${validMenuStyles.join(', ')}`,
        severity: 'error',
      });
    }
  }

  return {
    isValid: errors.filter((e) => e.severity === 'error').length === 0,
    errors,
  };
}

// ==================== MIGRATION ====================

export interface MigrationScript {
  fromVersion: string;
  toVersion: string;
  migrate: (config: any) => BuilderConfiguration;
}

export const MIGRATIONS: MigrationScript[] = [
  // Migration from old branding to builder config
  {
    fromVersion: '0.0.0',
    toVersion: '1.0.0',
    migrate: (oldConfig: any): BuilderConfiguration => {
      return {
        ...DEFAULT_BUILDER_CONFIG,
        theme: {
          ...DEFAULT_BUILDER_CONFIG.theme,
          colors: {
            ...DEFAULT_BUILDER_CONFIG.theme.colors,
            primary:
              oldConfig?.theme?.colors?.primary ||
              DEFAULT_BUILDER_CONFIG.theme.colors.primary,
            secondary: oldConfig?.theme?.colors?.secondary,
            accent: oldConfig?.theme?.colors?.accent,
          },
        },
        lastModified: new Date().toISOString(),
      };
    },
  },
];

export function migrateConfig(
  config: any,
  fromVersion: string,
  toVersion: string,
): BuilderConfiguration {
  let current = config;

  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === fromVersion) {
      current = migration.migrate(current);
      fromVersion = migration.toVersion;
    }

    if (fromVersion === toVersion) {
      break;
    }
  }

  return current;
}

// ==================== SECTION NAMES ====================

export const VALID_SECTION_NAMES = [
  'nav',
  'hero',
  'menu',
  'info',
  'footer',
  'cart',
  'checkout',
  'reservations',
] as const;
export type SectionName = (typeof VALID_SECTION_NAMES)[number];

export function isValidSectionName(name: string): name is SectionName {
  return VALID_SECTION_NAMES.includes(name as SectionName);
}
