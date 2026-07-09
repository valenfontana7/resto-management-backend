import { Injectable } from '@nestjs/common';
import {
  OperationShiftSegment,
  OrderStatus,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { ResolutionMemoryService } from './resolution-memory.service';
import {
  aggregateHourlyBuckets,
  buildRiskWindows,
  computeConfidence,
  findPeakHour,
  resolveSegmentHours,
  suggestStaffCount,
} from '../utils/shift-forecast.utils';

@Injectable()
export class ShiftForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly resolutionMemory: ResolutionMemoryService,
  ) {}

  async getPlan(
    restaurantId: string,
    userId: string,
    opts?: { segment?: OperationShiftSegment; businessDate?: string },
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const segment = opts?.segment ?? OperationShiftSegment.EVENING;
    const businessDate = opts?.businessDate
      ? new Date(opts.businessDate)
      : new Date();
    const dayOfWeek = businessDate.getDay();
    const segmentHours = resolveSegmentHours(segment);

    const since = new Date(businessDate);
    since.setDate(since.getDate() - 56);

    const [orders, reservations, patterns, stationRows] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: since },
          status: {
            in: [
              OrderStatus.DELIVERED,
              OrderStatus.READY,
              OrderStatus.PREPARING,
              OrderStatus.PAID,
              OrderStatus.CONFIRMED,
            ],
          },
        },
        select: { createdAt: true },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: {
            gte: new Date(
              Date.UTC(
                businessDate.getUTCFullYear(),
                businessDate.getUTCMonth(),
                businessDate.getUTCDate(),
              ),
            ),
            lt: new Date(
              Date.UTC(
                businessDate.getUTCFullYear(),
                businessDate.getUTCMonth(),
                businessDate.getUTCDate() + 1,
              ),
            ),
          },
          status: {
            in: [
              ReservationStatus.CONFIRMED,
              ReservationStatus.PENDING,
              ReservationStatus.SEATED,
            ],
          },
        },
      }),
      this.resolutionMemory.getActivePatterns(restaurantId, 3),
      this.prisma.coordination.groupBy({
        by: ['type'],
        where: {
          restaurantId,
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
    ]);

    const sameDowOrders = orders.filter(
      (order) => order.createdAt.getDay() === dayOfWeek,
    );
    const sampleWeeks = Math.max(
      1,
      Math.round(sameDowOrders.length / Math.max(1, suggestStaffCount(12))),
    );
    const expectedOrders = Math.round(
      sameDowOrders.length / Math.max(sampleWeeks, 4),
    );
    const hourly = aggregateHourlyBuckets(sameDowOrders, segmentHours);
    const avgPerHour =
      hourly.length > 0
        ? hourly.reduce((sum, row) => sum + row.count, 0) / hourly.length
        : 0;
    const peakHour = findPeakHour(hourly);
    const riskWindows = buildRiskWindows(hourly, avgPerHour);

    const incidentHeavy =
      stationRows.find((row) => row.type === 'INCIDENT')?._count._all ?? 0;
    const suggestedStationFocus = [
      {
        stationKind: 'KITCHEN',
        reason:
          peakHour != null
            ? `Pico histórico cerca de las ${peakHour}:00`
            : 'Cocina como eje del servicio',
      },
    ];
    if (incidentHeavy >= 3) {
      suggestedStationFocus.push({
        stationKind: 'FLOOR',
        reason: 'Incidencias recurrentes — reforzar salón',
      });
    }

    return {
      plan: {
        businessDate: businessDate.toISOString().slice(0, 10),
        segment,
        dayOfWeek,
        expectedOrders: expectedOrders + reservations,
        expectedPeakHour: peakHour,
        suggestedStaffCount: suggestStaffCount(expectedOrders + reservations),
        suggestedStationFocus,
        riskWindows,
        activePatterns: patterns,
        confidence: computeConfidence(sampleWeeks, sameDowOrders.length),
        reservationsToday: reservations,
      },
    };
  }
}
