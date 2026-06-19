export interface CashRegisterCloseReportOrderLine {
  orderId: string | null;
  orderNumber: string | null;
  tableLabel: string | null;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  description: string | null;
}

export interface CashRegisterCloseReportMovementLine {
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface CashRegisterCloseReport {
  kind: 'PARTIAL';
  sessionId: string;
  restaurantName: string;
  openedAt: string;
  closedAt: string;
  openedByName: string;
  closedByName: string | null;
  terminal: { id: string; name: string } | null;
  openingFloat: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  salesByMethod: Array<{
    paymentMethod: string;
    total: number;
    count: number;
  }>;
  totalRevenue: number;
  orders: CashRegisterCloseReportOrderLine[];
  otherMovements: CashRegisterCloseReportMovementLine[];
  depositToMain?: number | null;
}
