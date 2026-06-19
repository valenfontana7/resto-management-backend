export interface MainCashCloseReport {
  kind: 'MAIN';
  sessionId: string;
  restaurantName: string;
  openedAt: string;
  closedAt: string;
  openedByName: string;
  closedByName: string | null;
  openingFloat: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  totalDeposits: number;
  totalWithdrawals: number;
  depositsFromPartials: Array<{
    partialSessionId: string;
    openedByName: string;
    terminal: string | null;
    amount: number;
    depositedAt: string;
  }>;
  movements: Array<{
    type: string;
    amount: number;
    description: string | null;
    createdAt: string;
  }>;
}
