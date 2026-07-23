/**
 * Demo World — shared types for flagship story-driven demos.
 * Single source of truth: StoryProfile → DemoWorld → DemoExample + Prisma tenant.
 */

export const FLAGSHIP_DEMO_SLUGS = [
  'la-parrilla',
  'cafe-central',
  'burger-lab',
  'pizza-artesanal',
  'sushi-express',
] as const;
export type FlagshipDemoSlug = (typeof FLAGSHIP_DEMO_SLUGS)[number];

export const DEMO_FLAGSHIP_TAG = 'demo-flagship';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type CustomerSegment = 'one_shot' | 'regular' | 'vip' | 'churn_return';

export type DemoOrderChannel = 'delivery' | 'pickup' | 'dine_in';

export type DemoOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface StoryHours {
  open: string;
  close: string;
  closed?: boolean;
}

export interface StoryDishDef {
  category: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  prepMinutes: number;
  featured?: boolean;
  hitWeight: number;
  image?: string;
  tags?: string[];
}

export interface StoryStaffMember {
  name: string;
  role: 'OWNER' | 'MANAGER' | 'WAITER' | 'CHEF' | 'CASHIER' | 'DELIVERY';
  emailLocal: string;
}

export interface StorySupplier {
  name: string;
  category: string;
  contact: string;
}

export interface StoryPromo {
  code: string;
  name: string;
  description: string;
  discountPercent: number;
  daysActive: DayOfWeek[];
}

export interface StoryInventoryItem {
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  linkedDishNames?: string[];
}

export interface StoryProfile {
  slug: FlagshipDemoSlug;
  sortOrder: number;
  /** Fixed PRNG seed for reproducibility */
  seed: number;
  name: string;
  type: 'restaurant' | 'cafe' | 'bar';
  cuisine: string[];
  city: string;
  neighborhood: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  foundedYear: number;
  capacity: number;
  priceRange: '$$' | '$$$';
  concept: string;
  ownerName: string;
  ownerStory: string;
  whyOpened: string;
  targetAudience: string;
  avgTicket: number;
  monthlyOrderTarget: number;
  hits: string[];
  problems: string[];
  busyDays: DayOfWeek[];
  slowDays: DayOfWeek[];
  peakHours: number[];
  deadHours: number[];
  hours: Record<DayOfWeek, StoryHours>;
  description: string;
  aboutTitle: string;
  aboutBody: string;
  aboutHighlights: string[];
  menu: StoryDishDef[];
  staff: StoryStaffMember[];
  suppliers: StorySupplier[];
  promos: StoryPromo[];
  inventory: StoryInventoryItem[];
  tableLayout?: { areas: Array<{ name: string; tables: number[] }> };
  media: {
    logo: string;
    cover: string;
    hero: string;
    interior: string[];
  };
  historyDays: number;
}

export interface WorldDish {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  prepMinutes: number;
  featured: boolean;
  hitWeight: number;
  image: string;
  tags: string[];
  order: number;
}

export interface WorldCategory {
  id: string;
  name: string;
  order: number;
  image?: string;
}

export interface WorldCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  segment: CustomerSegment;
  favoriteDishNames: string[];
  firstOrderDayOffset: number;
  lastOrderDayOffset: number;
  orderCountTarget: number;
}

export interface WorldKitchenTransition {
  status: DemoOrderStatus;
  atOffsetMinutes: number;
}

export interface WorldOrderItem {
  dishId: string;
  dishName: string;
  quantity: number;
  unitPrice: number;
}

export interface WorldOrder {
  id: string;
  dayOffset: number;
  hour: number;
  minute: number;
  channel: DemoOrderChannel;
  status: DemoOrderStatus;
  customerId: string | null;
  customerName: string;
  items: WorldOrderItem[];
  subtotal: number;
  total: number;
  kitchen: WorldKitchenTransition[];
  delayed: boolean;
  cancelled: boolean;
  notes?: string;
}

export interface WorldReservation {
  id: string;
  dayOffset: number;
  hour: number;
  minute: number;
  partySize: number;
  customerName: string;
  tableLabel: string;
  occasion?: string;
  status: 'CONFIRMED' | 'PENDING' | 'NO_SHOW' | 'COMPLETED';
}

export interface WorldTable {
  id: string;
  area: string;
  number: number;
  capacity: number;
  label: string;
}

export interface WorldReview {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  dayOffset: number;
  dishName?: string;
}

export interface WorldStaff {
  id: string;
  name: string;
  role: StoryStaffMember['role'];
  email: string;
}

export interface WorldPromo {
  id: string;
  code: string;
  name: string;
  description: string;
  discountPercent: number;
  daysActive: DayOfWeek[];
}

export interface WorldInventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  linkedDishNames: string[];
}

export interface WorldSupplier {
  id: string;
  name: string;
  category: string;
  contact: string;
}

export interface WorldAnalytics {
  topDishes: Array<{
    dishId: string;
    dishName: string;
    categoryName: string;
    quantity: number;
    revenue: number;
    percentage: number;
  }>;
  todayStats: {
    revenue: number;
    orders: number;
    averageOrder: number;
    reservations: number;
  };
  yesterdayStats: {
    revenue: number;
    orders: number;
    averageOrder: number;
    reservations: number;
  };
  weekdayOrderCounts: Record<DayOfWeek, number>;
  monthlyOrders: number;
  avgOrderValue: number;
}

/** Snapshot consumed by /demo admin mocks */
export interface OperationalSnapshotFloorCashMovement {
  id: string;
  type: 'SALE' | 'DEPOSIT' | 'OPENING_FLOAT';
  amount: number;
  paymentMethod?: string;
  description: string;
  createdAtOffsetMinutes: number;
}

export interface OperationalSnapshotFloorOpenSessionItem {
  dishName: string;
  quantity: number;
  unitPrice: number;
}

export interface OperationalSnapshotFloorOpenSession {
  id: string;
  tableLabel: string;
  tableNumber: number;
  guestCount: number;
  customerName: string;
  waiterName: string;
  items: OperationalSnapshotFloorOpenSessionItem[];
  subtotal: number;
  openedAtOffsetMinutes: number;
}

export interface OperationalSnapshotFiscalDocument {
  id: string;
  type: 'FACTURA_B' | 'FACTURA_C' | 'FACTURA_A' | 'INTERNAL_TICKET';
  status: 'AUTHORIZED';
  subtotal: number;
  ivaAmount: number;
  total: number;
  cae: string;
  numero: number;
  puntoVenta: number;
  customerName?: string;
  dayOffset: number;
  hour: number;
  minute: number;
}

export interface OperationalSnapshotFloor {
  cashRegister: {
    id: string;
    status: 'OPEN';
    level: 'PARTIAL';
    openingFloat: number;
    expectedCash: number;
    openedByName: string;
    openedAtOffsetMinutes: number;
    notes: string;
    movements: OperationalSnapshotFloorCashMovement[];
    salesByMethod: Array<{
      paymentMethod: string;
      total: number;
      count: number;
    }>;
  };
  openSessions: OperationalSnapshotFloorOpenSession[];
  closedSessionCount: number;
  fiscalDocuments: OperationalSnapshotFiscalDocument[];
}

/** Snapshot consumed by /demo admin mocks */
export interface OperationalSnapshot {
  version: 1;
  slug: string;
  generatedAt: string;
  orders: WorldOrder[];
  customers: WorldCustomer[];
  reviews: WorldReview[];
  reservations: WorldReservation[];
  inventory: WorldInventoryItem[];
  promos: WorldPromo[];
  staff: WorldStaff[];
  suppliers: WorldSupplier[];
  tables: WorldTable[];
  analytics: WorldAnalytics;
  floor: OperationalSnapshotFloor;
}

export interface DemoWorld {
  profile: StoryProfile;
  categories: WorldCategory[];
  dishes: WorldDish[];
  customers: WorldCustomer[];
  orders: WorldOrder[];
  reservations: WorldReservation[];
  tables: WorldTable[];
  reviews: WorldReview[];
  staff: WorldStaff[];
  promos: WorldPromo[];
  inventory: WorldInventoryItem[];
  suppliers: WorldSupplier[];
  analytics: WorldAnalytics;
  operationalSnapshot: OperationalSnapshot;
}
