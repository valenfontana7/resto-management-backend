import type { DailyCloseConfig } from '../types/daily-close-report.types';
import { DEFAULT_DAILY_CLOSE_CONFIG } from '../types/daily-close-report.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function resolveDailyCloseConfig(
  businessRules: unknown,
): DailyCloseConfig {
  const rules = asRecord(businessRules);
  const floor = asRecord(rules?.floor);
  const dailyClose = asRecord(floor?.dailyClose);

  return {
    requireClosedTables:
      typeof dailyClose?.requireClosedTables === 'boolean'
        ? dailyClose.requireClosedTables
        : DEFAULT_DAILY_CLOSE_CONFIG.requireClosedTables,
    requireNoOpenCash:
      typeof dailyClose?.requireNoOpenCash === 'boolean'
        ? dailyClose.requireNoOpenCash
        : DEFAULT_DAILY_CLOSE_CONFIG.requireNoOpenCash,
    requireClosingChecklist:
      typeof dailyClose?.requireClosingChecklist === 'boolean'
        ? dailyClose.requireClosingChecklist
        : DEFAULT_DAILY_CLOSE_CONFIG.requireClosingChecklist,
  };
}
