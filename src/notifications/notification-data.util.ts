import { Prisma } from '@prisma/client';

/**
 * Prisma Json fields reject Decimal, Date, BigInt, etc.
 * Normaliza valores antes de persistir en Notification.data.
 */
export function sanitizeNotificationData(
  value: unknown,
): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const decimalLike = value as { toNumber?: () => number };
    if (typeof decimalLike.toNumber === 'function') {
      try {
        return decimalLike.toNumber();
      } catch {
        const text =
          typeof (value as { toString?: () => string }).toString === 'function'
            ? (value as { toString: () => string }).toString()
            : '0';
        return Number(text);
      }
    }

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeNotificationData(item));
    }

    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (nested === undefined) continue;
      result[key] = sanitizeNotificationData(nested);
    }
    return result;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'symbol') {
    return value.description ?? value.toString();
  }

  if (typeof value === 'function') {
    return value.name || 'function';
  }

  return '[unsupported]';
}
