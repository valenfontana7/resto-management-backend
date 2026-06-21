export const ADMIN_ALERT_EVENT_TOGGLE_DEFAULTS = {
  userRegistered: true,
  restaurantCreated: true,
  userUpdated: true,
  restaurantStatusChanged: true,
  restaurantDeactivated: true,
  subscriptionUpdated: true,
  subscriptionPlanChanged: true,
  subscriptionCanceled: true,
  subscriptionReactivated: true,
  trialEnabled: true,
  trialDisabled: true,
  billingControlsUpdated: true,
  edgeSyncStale: true,
} as const;

export type AdminAlertEventToggleKey =
  keyof typeof ADMIN_ALERT_EVENT_TOGGLE_DEFAULTS;

export type AdminAlertEventToggles = Record<AdminAlertEventToggleKey, boolean>;

export const ADMIN_ALERT_EVENT_KEY_MAP: Record<
  string,
  AdminAlertEventToggleKey
> = {
  USER_REGISTERED: 'userRegistered',
  RESTAURANT_CREATED: 'restaurantCreated',
  USER_UPDATED: 'userUpdated',
  RESTAURANT_STATUS_CHANGED: 'restaurantStatusChanged',
  RESTAURANT_DEACTIVATED: 'restaurantDeactivated',
  SUBSCRIPTION_UPDATED: 'subscriptionUpdated',
  SUBSCRIPTION_PLAN_CHANGED: 'subscriptionPlanChanged',
  SUBSCRIPTION_CANCELED: 'subscriptionCanceled',
  SUBSCRIPTION_REACTIVATED: 'subscriptionReactivated',
  TRIAL_ENABLED: 'trialEnabled',
  TRIAL_DISABLED: 'trialDisabled',
  BILLING_CONTROLS_UPDATED: 'billingControlsUpdated',
  EDGE_SYNC_STALE: 'edgeSyncStale',
};

export const REGISTRATION_ADMIN_ALERT_EVENT_KEYS =
  new Set<AdminAlertEventToggleKey>([
    'userRegistered',
    'restaurantCreated',
    'userUpdated',
    'restaurantStatusChanged',
    'restaurantDeactivated',
  ]);

export const PAYMENT_ADMIN_ALERT_EVENT_KEYS = new Set<AdminAlertEventToggleKey>(
  [
    'subscriptionUpdated',
    'subscriptionPlanChanged',
    'subscriptionCanceled',
    'subscriptionReactivated',
    'trialEnabled',
    'trialDisabled',
    'billingControlsUpdated',
  ],
);

const ADMIN_ALERT_EVENT_TOGGLE_KEYS = Object.keys(
  ADMIN_ALERT_EVENT_TOGGLE_DEFAULTS,
) as AdminAlertEventToggleKey[];

export function normalizeAdminAlertEventToggles(
  raw: unknown,
): AdminAlertEventToggles {
  const normalized: AdminAlertEventToggles = {
    ...ADMIN_ALERT_EVENT_TOGGLE_DEFAULTS,
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return normalized;
  }

  const source = raw as Record<string, unknown>;
  for (const key of ADMIN_ALERT_EVENT_TOGGLE_KEYS) {
    if (typeof source[key] === 'boolean') {
      normalized[key] = source[key];
    }
  }

  return normalized;
}

export function mergeAdminAlertEventToggles(
  base: unknown,
  patch: Partial<Record<AdminAlertEventToggleKey, boolean>>,
): AdminAlertEventToggles {
  const current = normalizeAdminAlertEventToggles(base);
  const merged = { ...current };

  for (const key of ADMIN_ALERT_EVENT_TOGGLE_KEYS) {
    if (typeof patch[key] === 'boolean') {
      merged[key] = patch[key];
    }
  }

  return merged;
}
