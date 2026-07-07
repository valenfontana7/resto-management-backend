/**
 * Prospect Bundle v1.0 — formato de intercambio entre el motor de prospección
 * (cualquier LLM) y Bentoo. Bentoo se acopla SOLO a este schema, nunca al modelo.
 *
 * El bundle nunca se persiste tal cual: se transforma al modelo interno
 * (DemoExample + payload de restaurante demo) vía `mapper.ts`.
 */

export const SUPPORTED_SCHEMA_VERSIONS = ['1.0'] as const;

export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

// ============================================================================
// Bloques del bundle
// ============================================================================

export interface ConfidenceEntry<T = unknown> {
  value: T;
  confidence: number;
  source: string[];
  status?: string;
  alternate?: string;
}

export interface BundleProspect {
  id: string;
  businessName: string;
  city: string;
  country: string;
  neighborhood?: string;
  address?: string;
  coordinates?: {
    lat: number;
    lng: number;
    confidence?: number;
    source?: string[];
  };
  sources: string[];
  researchedUrls: string[];
  leadId?: string | null;
}

export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const DAY_KEYS: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface OpeningRange {
  open: string;
  close: string;
}

export interface BundleBusiness {
  description: string;
  cuisine: string[];
  category: string;
  positioning?: string;
  targetAudience?: string[];
  averageTicket?: {
    value: number;
    currency: string;
    confidence?: number;
    source?: string[];
  };
  openingHours: Record<DayKey, OpeningRange[]>;
  services: {
    dineIn?: boolean;
    delivery?: boolean;
    takeAway?: boolean;
    reservations?: boolean;
    catering?: boolean;
    events?: boolean;
    giftCards?: boolean;
    retail?: boolean;
  };
  paymentMethods?: string[];
  cashDiscountPercent?: number;
  languages?: string[];
  differentiators?: string[];
  houseRules?: string[];
  foundedYear?: number;
  capacity?: number;
  rating?: number;
  reviewCount?: number;
}

export interface BundleBranding {
  logo?: { mediaId: string; status?: string; replaceWith?: string };
  favicon?: { mediaId: string; status?: string };
  colorPalette: Record<string, string>;
  typography: {
    headingFont: string;
    bodyFont: string;
    baseSize?: string;
    headingWeight?: number;
    bodyWeight?: number;
  };
  iconStyle?: string;
  photographyStyle?: string;
  toneOfVoice?: string;
  personality?: string[];
  visualKeywords?: string[];
}

export interface BundleTheme {
  borderRadius?: string;
  spacing?: string;
  shadows?: string;
  cardStyle?: string;
  buttonStyle?: string;
  sectionSpacing?: string;
  animationStyle?: string;
  layoutDensity?: string;
  heroOverlay?: { color: string; opacity: number };
  menuLayout?: string;
  categoryDisplay?: string;
  maxWidth?: string;
}

export interface BundleCategory {
  id: string;
  name: string;
  description?: string;
  order: number;
}

export interface BundleProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  ingredients?: string[];
  allergens?: string[];
  dietaryTags?: string[];
  spicyLevel?: number;
  popularity?: number;
  badges?: string[];
  imageReference: string;
  confidence?: number;
}

export interface BundleMenu {
  currency: string;
  pricesVerifiedAt?: string;
  priceSource?: string;
  categories: BundleCategory[];
  products: BundleProduct[];
}

export type MediaSource = 'REAL' | 'GENERATED' | 'PLACEHOLDER';

export interface BundleMediaImage {
  id: string;
  type: string;
  source: MediaSource;
  filename: string;
  alt: string;
  priority: string;
  prompt?: string | null;
  replaceWith?: string;
  note?: string;
}

export interface BundleMedia {
  basePath: string;
  images: BundleMediaImage[];
}

export interface BundleCta {
  id: string;
  label: string;
  /** Formato `anchor:<sectionAnchor>` o `route:<path>` */
  target: string;
  hierarchy?: 'primary' | 'secondary';
}

export interface BundleSection {
  enabled: boolean;
  order: number;
  anchor: string;
  reason?: string;
  content: Record<string, unknown>;
  ctas?: BundleCta[];
}

export interface BundleSeo {
  title: string;
  metaDescription: string;
  keywords: string[];
  canonical?: string;
  openGraph?: Record<string, string>;
  twitter?: Record<string, string>;
  localBusinessSchema?: Record<string, unknown>;
  faqSchema?: Array<{ question: string; answer: string }>;
}

export interface BundleSocial {
  [network: string]: ConfidenceEntry<string | null> | undefined;
}

export interface BundleBuilderRoute {
  path: string;
  type: string;
  sections?: string[];
}

export interface BundleBuilder {
  routes: BundleBuilderRoute[];
  navigation: {
    items: Array<{ label: string; target: string }>;
    ctaButton?: { label: string; target: string };
    showOpenStatus?: boolean;
  };
  homepageSectionOrder: string[];
  menuConfiguration?: Record<string, unknown>;
  orderingConfiguration?: Record<string, unknown>;
  reservationConfiguration?: Record<string, unknown>;
  colorTokens?: Record<string, string>;
  typographyTokens?: Record<string, string>;
  spacingTokens?: Record<string, string>;
  ctaHierarchy?: Record<string, unknown>;
  bentooImport?: {
    demoSlug?: string;
    visibility?: 'private-lead' | 'public-showcase';
    [key: string]: unknown;
  };
}

export interface ProspectBundle {
  schemaVersion: string;
  generatedAt: string;
  prospect: BundleProspect;
  business: BundleBusiness;
  branding: BundleBranding;
  theme: BundleTheme;
  menu: BundleMenu;
  sections: Record<string, BundleSection>;
  media: BundleMedia;
  seo: BundleSeo;
  social: BundleSocial;
  businessIntelligence?: Record<string, unknown>;
  confidence?: Record<string, ConfidenceEntry>;
  editor?: Record<string, unknown>;
  builder: BundleBuilder;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Modelo interno mapeado (destino: DemoExample de Prisma)
// ============================================================================

export interface MappedDemoExampleRecord {
  slug: string;
  name: string;
  type: string;
  cuisine: string[];
  city: string;
  neighborhood: string;
  isPublic: boolean;
  leadId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

export interface MappedImport {
  record: MappedDemoExampleRecord;
  /** Payload JSON persistido en DemoExample.payload (modelo demo del frontend). */
  payload: Record<string, unknown>;
  counts: ImportCounts;
  warnings: string[];
}

export interface ImportCounts {
  products: number;
  categories: number;
  sectionsActive: number;
  images: number;
  seoCompleted: boolean;
}

// ============================================================================
// Validación y reporte
// ============================================================================

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface ImportStepLog {
  step: string;
  durationMs: number;
}

export interface ImportReport {
  success: boolean;
  restaurantName: string;
  restaurantId: string | null;
  slug: string;
  created: boolean;
  counts: ImportCounts;
  warnings: string[];
  errors: string[];
  durationMs: number;
  steps: ImportStepLog[];
  urls: {
    demo: string;
    demoAdmin: string;
    masterEditor: string;
  };
}
