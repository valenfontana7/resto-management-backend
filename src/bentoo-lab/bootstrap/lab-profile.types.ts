export const LAB_PROFILES = ['minimal', 'ops-core'] as const;

export type LabProfile = (typeof LAB_PROFILES)[number];

export const DEFAULT_LAB_PROFILE: LabProfile = 'ops-core';

export function resolveLabProfile(value?: string | null): LabProfile {
  if (value === 'minimal' || value === 'ops-core') {
    return value;
  }
  return DEFAULT_LAB_PROFILE;
}

export const LAB_HITL_ROLES = [
  'manager',
  'kitchen',
  'waiter',
  'owner',
  'chef',
] as const;

export type LabHitlRole = (typeof LAB_HITL_ROLES)[number];

export function resolveLabHitlRole(value?: string | null): LabHitlRole | null {
  if (
    value === 'manager' ||
    value === 'kitchen' ||
    value === 'waiter' ||
    value === 'owner' ||
    value === 'chef'
  ) {
    return value;
  }
  return null;
}
