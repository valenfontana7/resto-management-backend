import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type OrderScheduleRules = {
  allowScheduledOrders?: boolean;
  maxScheduledDaysAhead?: number;
  orderLeadTime?: number;
};

export type BusinessHourRow = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
};

export type ResolvedSchedule = {
  scheduledFor: Date | null;
  kitchenReleasedAt: Date | null;
  leadMinutes: number;
};

const DEFAULT_LEAD_MINUTES = 30;
const DEFAULT_MAX_DAYS_AHEAD = 7;

export function extractOrderScheduleRules(
  businessRules: unknown,
): OrderScheduleRules {
  if (!businessRules || typeof businessRules !== 'object') return {};
  const orders = (businessRules as Record<string, unknown>).orders;
  if (!orders || typeof orders !== 'object') return {};
  return orders as OrderScheduleRules;
}

export function resolveLeadMinutes(rules: OrderScheduleRules): number {
  const raw = rules.orderLeadTime;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return DEFAULT_LEAD_MINUTES;
}

export function resolveMaxDaysAhead(rules: OrderScheduleRules): number {
  const raw = rules.maxScheduledDaysAhead;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_DAYS_AHEAD;
}

/** Minutes from midnight for "HH:mm" or "HH:mm:ss". */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function isInstantWithinBusinessHours(
  instant: Date,
  hours: BusinessHourRow[],
): boolean {
  const dayOfWeek = instant.getDay(); // 0=Sun … 6=Sat (same as JS / Prisma seed)
  const dayRows = hours.filter((h) => h.dayOfWeek === dayOfWeek);
  if (dayRows.length === 0) return false;

  const minuteOfDay = instant.getHours() * 60 + instant.getMinutes();

  for (const row of dayRows) {
    if (!row.isOpen) continue;
    const open = parseTimeToMinutes(row.openTime);
    const close = parseTimeToMinutes(row.closeTime);
    if (open === null || close === null) continue;

    if (close > open) {
      if (minuteOfDay >= open && minuteOfDay < close) return true;
    } else if (close < open) {
      // Overnight range (e.g. 22:00–02:00)
      if (minuteOfDay >= open || minuteOfDay < close) return true;
    } else {
      // open === close → treat as 24h open that day
      return true;
    }
  }

  return false;
}

export function isKitchenReleased(params: {
  scheduledFor: Date | null | undefined;
  kitchenReleasedAt?: Date | null;
  now: Date;
  leadMinutes: number;
}): boolean {
  if (!params.scheduledFor) return true;
  if (params.kitchenReleasedAt) return true;
  const releaseAt = new Date(
    params.scheduledFor.getTime() - params.leadMinutes * 60_000,
  );
  return params.now.getTime() >= releaseAt.getTime();
}

/** Prisma filter: orders kitchen may see / prepare. */
export function kitchenVisibleOrderWhere(): Prisma.OrderWhereInput {
  return {
    OR: [{ scheduledFor: null }, { kitchenReleasedAt: { not: null } }],
  };
}

/**
 * Parse optional ISO scheduledFor from the client.
 * Empty / missing → ASAP (null).
 */
export function resolveScheduledOrder(params: {
  scheduledForRaw?: string | null;
  rules: OrderScheduleRules;
  hours: BusinessHourRow[];
  now: Date;
}): ResolvedSchedule {
  const leadMinutes = resolveLeadMinutes(params.rules);
  const raw = (params.scheduledForRaw ?? '').trim();

  if (!raw) {
    return {
      scheduledFor: null,
      kitchenReleasedAt: params.now,
      leadMinutes,
    };
  }

  if (params.rules.allowScheduledOrders === false) {
    throw new BadRequestException(
      'Este restaurante no acepta pedidos programados.',
    );
  }

  const scheduledFor = new Date(raw);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new BadRequestException('scheduledFor inválido');
  }

  const minTime = new Date(params.now.getTime() + leadMinutes * 60_000);
  if (scheduledFor.getTime() < minTime.getTime()) {
    throw new BadRequestException(
      `El horario programado debe ser al menos ${leadMinutes} minutos desde ahora.`,
    );
  }

  const maxDays = resolveMaxDaysAhead(params.rules);
  const maxTime = new Date(params.now.getTime() + maxDays * 24 * 60 * 60_000);
  if (scheduledFor.getTime() > maxTime.getTime()) {
    throw new BadRequestException(
      `Solo se puede programar hasta ${maxDays} día${maxDays === 1 ? '' : 's'} adelante.`,
    );
  }

  if (!isInstantWithinBusinessHours(scheduledFor, params.hours)) {
    throw new BadRequestException(
      'El horario elegido está fuera del horario de atención del restaurante.',
    );
  }

  const released = isKitchenReleased({
    scheduledFor,
    now: params.now,
    leadMinutes,
  });

  return {
    scheduledFor,
    kitchenReleasedAt: released ? params.now : null,
    leadMinutes,
  };
}
