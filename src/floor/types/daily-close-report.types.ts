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
  totalRevenue: number;
  totalOrders: number;
  orders: DailyCloseReportOrderLine[];
  partialCashSummary: {
    sessionCount: number;
    totalCountedCash: number;
    totalExpectedCash: number;
    totalDifference: number;
  };
  notes: string | null;
}

export type DailyCloseBlockerCode =
  | 'DAILY_ALREADY_CLOSED'
  | 'OPEN_PARTIAL_CASH'
  | 'OPEN_TABLES'
  | 'INCOMPLETE_CLOSING_CHECKLIST';

export interface DailyCloseBlocker {
  code: DailyCloseBlockerCode;
  message: string;
}

export interface DailyCloseConfig {
  requireClosedTables: boolean;
  requireNoOpenCash: boolean;
  requireClosingChecklist: boolean;
}

export const DEFAULT_DAILY_CLOSE_CONFIG: DailyCloseConfig = {
  requireClosedTables: true,
  requireNoOpenCash: true,
  requireClosingChecklist: false,
};
