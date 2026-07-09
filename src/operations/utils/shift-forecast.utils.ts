import type { OperationShiftSegment } from '@prisma/client';

export interface HourlyOrderBucket {
  hour: number;
  count: number;
}

export function resolveSegmentHours(segment: OperationShiftSegment): {
  startHour: number;
  endHour: number;
} {
  switch (segment) {
    case 'MORNING':
      return { startHour: 11, endHour: 16 };
    case 'AFTERNOON':
      return { startHour: 16, endHour: 20 };
    case 'EVENING':
      return { startHour: 20, endHour: 24 };
    default:
      return { startHour: 11, endHour: 24 };
  }
}

export function suggestStaffCount(expectedOrders: number): number {
  if (expectedOrders <= 0) return 2;
  return Math.min(8, Math.max(2, 2 + Math.ceil(expectedOrders / 12)));
}

export function computeConfidence(
  sampleWeeks: number,
  orderSampleSize: number,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (sampleWeeks >= 4 && orderSampleSize >= 40) return 'HIGH';
  if (sampleWeeks >= 2 && orderSampleSize >= 15) return 'MEDIUM';
  return 'LOW';
}

export function aggregateHourlyBuckets(
  orders: Array<{ createdAt: Date }>,
  segmentHours: { startHour: number; endHour: number },
): HourlyOrderBucket[] {
  const buckets = new Map<number, number>();
  for (const order of orders) {
    const hour = order.createdAt.getHours();
    if (hour < segmentHours.startHour || hour >= segmentHours.endHour) continue;
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);
}

export function findPeakHour(buckets: HourlyOrderBucket[]): number | null {
  if (buckets.length === 0) return null;
  return buckets.reduce((best, row) => (row.count > best.count ? row : best))
    .hour;
}

export function buildRiskWindows(
  buckets: HourlyOrderBucket[],
  avgPerHour: number,
): Array<{ hour: number; label: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }> {
  if (avgPerHour <= 0) return [];
  return buckets
    .filter((row) => row.count >= avgPerHour * 1.35)
    .map((row) => ({
      hour: row.hour,
      label: `Pico ~${row.count} pedidos/h`,
      severity:
        row.count >= avgPerHour * 2
          ? ('HIGH' as const)
          : row.count >= avgPerHour * 1.6
            ? ('MEDIUM' as const)
            : ('LOW' as const),
    }));
}
