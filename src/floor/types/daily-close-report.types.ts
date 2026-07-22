export interface DailyCloseReportPartialSession {
  sessionId: string;
  openedByName: string;
  terminal: string | null;
  openedAt: string;
  closedAt: string;
  totalRevenue: number;
  countedCash: number | null;
  difference: number | null;
}

export interface DailyCloseReportOrderLine {
  orderId: string;
  orderNumber: string;
  channel: 'salon' | 'online';
  customerLabel: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}

export interface DailyCloseReport {
  kind: 'DAILY';
  businessDate: string;
  restaurantName: string;
  closedAt: string;
  closedByName: string;
  partialSessions: DailyCloseReportPartialSession[];
  salesByMethod: Array<{
    paymentMethod: string;
    total: number;
    count: number;
  }>;
  channelBreakdown: {
    salon: number;
    online: number;
  };
  /** Suma de totales con paymentStatus=PAID (no cancelados). */
  totalRevenue: number;
  /** Suma de totales con cobro pendiente (no cancelados). */
  pendingRevenue: number;
  /** Cantidad de pedidos cobrados (PAID). */
  totalOrders: number;
  /** Cantidad de pedidos con cobro pendiente. */
  pendingOrders: number;
  orders: DailyCloseReportOrderLine[];
  partialCashSummary: {
    sessionCount: number;
    totalCountedCash: number;
    totalExpectedCash: number;
    totalDifference: number;
  };
  notes: string | null;
  /** Traspaso del día para la apertura de mañana (continuidad). */
  dayHandoff?: {
    notes: string | null;
    openCriticalCount: number;
    cashDifference: number | null;
    closedAt: string;
  };
}

export type DailyCloseBlockerCode =
  | 'DAILY_ALREADY_CLOSED'
  | 'DAY_NOT_OPENED'
  | 'OPEN_PARTIAL_CASH'
  | 'OPEN_TABLES'
  | 'INCOMPLETE_CLOSING_CHECKLIST'
  | 'OPEN_UNPAID_ORDERS'
  | 'OPEN_KITCHEN_ORDERS';

export interface DailyCloseActionableOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  customerName: string | null;
}

export interface DailyCloseBlocker {
  code: DailyCloseBlockerCode;
  message: string;
  /** Pedidos relacionados (cuando el blocker es por backlog online). */
  orderIds?: string[];
}

export interface DailyCloseConfig {
  requireClosedTables: boolean;
  requireNoOpenCash: boolean;
  requireClosingChecklist: boolean;
  /** Bloquear cierre si hay pedidos no cancelados con pago PENDING/FAILED. */
  requireNoUnpaidOrders: boolean;
  /** Bloquear cierre si hay pedidos en cocina/servicio no finalizados. */
  requireNoOpenKitchenOrders: boolean;
}

export const DEFAULT_DAILY_CLOSE_CONFIG: DailyCloseConfig = {
  requireClosedTables: true,
  requireNoOpenCash: true,
  requireClosingChecklist: false,
  requireNoUnpaidOrders: true,
  requireNoOpenKitchenOrders: true,
};
