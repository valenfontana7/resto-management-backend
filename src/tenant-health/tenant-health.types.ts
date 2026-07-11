export type TenantHealthBand = 'healthy' | 'attention' | 'at_risk' | 'critical';

export type TenantHealthPlaybookActionKey =
  | 'restaurant_detail'
  | 'impersonate'
  | 'activation_dashboard';

export interface TenantHealthPlaybookAction {
  key: TenantHealthPlaybookActionKey;
  label: string;
}

export interface TenantHealthPlaybook {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  actions: TenantHealthPlaybookAction[];
}

export interface TenantHealthMetricsInput {
  isPublished: boolean;
  hasOnlinePayments: boolean;
  ordersLast30d: number;
  usersActiveLast7d: number;
  subscriptionStatus: string | null;
}

export interface TenantHealthScore {
  restaurantId: string;
  slug: string;
  name: string;
  healthScore: number;
  band: TenantHealthBand;
  ordersLast30d: number;
  usersActiveLast7d: number;
  hasOnlinePayments: boolean;
  isPublished: boolean;
  subscriptionStatus: string | null;
  lastOrderAt: string | null;
  playbook: TenantHealthPlaybook;
}

export interface TenantHealth360Summary {
  total: number;
  byBand: Record<TenantHealthBand, number>;
}

export interface TenantHealth360Response {
  summary: TenantHealth360Summary;
  tenants: TenantHealthScore[];
}
