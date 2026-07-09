import { BusinessMemoryCategory, BusinessMemoryStatus } from '@prisma/client';

export const DEFAULT_MEMORY_TTL_DAYS: Record<BusinessMemoryCategory, number> = {
  [BusinessMemoryCategory.OPERATIONAL]: 14,
  [BusinessMemoryCategory.INVENTORY]: 30,
  [BusinessMemoryCategory.SALES]: 21,
  [BusinessMemoryCategory.MARKETING]: 45,
  [BusinessMemoryCategory.CUSTOMER]: 60,
  [BusinessMemoryCategory.RECOMMENDATION]: 30,
  [BusinessMemoryCategory.CONFIGURATION]: 30,
  [BusinessMemoryCategory.GROWTH]: 30,
  [BusinessMemoryCategory.RESOLUTION_PATTERN]: 90,
};

export function computeDefaultExpiresAt(
  category: BusinessMemoryCategory,
  from: Date = new Date(),
): Date {
  const days = DEFAULT_MEMORY_TTL_DAYS[category] ?? 30;
  const expires = new Date(from);
  expires.setDate(expires.getDate() + days);
  return expires;
}

export function isMemoryExpired(
  memory: { status: BusinessMemoryStatus; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (memory.status === BusinessMemoryStatus.EXPIRED) {
    return true;
  }
  if (!memory.expiresAt) {
    return false;
  }
  return memory.expiresAt.getTime() <= now.getTime();
}

export function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

export function daysBetween(start: Date, end: Date): number {
  const ms = startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function isSameUtcWeek(a: Date, b: Date): boolean {
  const weekStart = (date: Date) => {
    const day = startOfUtcDay(date);
    const weekday = day.getUTCDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    day.setUTCDate(day.getUTCDate() + diff);
    return day.getTime();
  };
  return weekStart(a) === weekStart(b);
}
