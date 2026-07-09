import { Injectable } from '@nestjs/common';
import { CoordinationStatus, OperationShiftStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CoordinationDigestStats {
  shiftsClosed: number;
  coordinationsTotal: number;
  coordinationsResolved: number;
  coordinationsEscalated: number;
  coordinationsExpired: number;
  resolutionRatePercent: number;
}

@Injectable()
export class CoordinationDigestService {
  constructor(private readonly prisma: PrismaService) {}

  async getWindowStats(
    restaurantId: string,
    since: Date,
    until: Date,
  ): Promise<CoordinationDigestStats | null> {
    const [coordinations, shiftsClosed] = await Promise.all([
      this.prisma.coordination.findMany({
        where: {
          restaurantId,
          createdAt: { gte: since, lte: until },
        },
        select: {
          status: true,
          escalatedToShiftLead: true,
        },
      }),
      this.prisma.operationShift.count({
        where: {
          restaurantId,
          status: OperationShiftStatus.CLOSED,
          closedAt: { gte: since, lte: until },
        },
      }),
    ]);

    if (coordinations.length === 0 && shiftsClosed === 0) {
      return null;
    }

    const coordinationsResolved = coordinations.filter(
      (row) => row.status === CoordinationStatus.RESOLVED,
    ).length;
    const coordinationsExpired = coordinations.filter(
      (row) => row.status === CoordinationStatus.EXPIRED,
    ).length;
    const coordinationsEscalated = coordinations.filter(
      (row) => row.escalatedToShiftLead,
    ).length;
    const coordinationsTotal = coordinations.length;
    const resolutionRatePercent =
      coordinationsTotal > 0
        ? Math.round((coordinationsResolved / coordinationsTotal) * 100)
        : 0;

    return {
      shiftsClosed,
      coordinationsTotal,
      coordinationsResolved,
      coordinationsEscalated,
      coordinationsExpired,
      resolutionRatePercent,
    };
  }
}
