import { Injectable } from '@nestjs/common';
import { SimulationRunStatus } from '@prisma/client';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * En Lab, resuelve YYYY-MM-DD del run más reciente del restaurant
 * cuando el cliente no manda ?date=.
 */
@Injectable()
export class LabBusinessDateService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSimulatedNow(restaurantId: string): Promise<Date | null> {
    if (!isLabRuntime()) {
      return null;
    }
    const run = await this.prisma.simulationRun.findFirst({
      where: {
        restaurantId,
        status: {
          in: [
            SimulationRunStatus.RUNNING,
            SimulationRunStatus.PAUSED,
            SimulationRunStatus.CREATED,
            SimulationRunStatus.COMPLETED,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { simulatedNow: true },
    });
    return run?.simulatedNow ?? null;
  }

  async resolveBusinessDateYmd(restaurantId: string): Promise<string | null> {
    const simulatedNow = await this.resolveSimulatedNow(restaurantId);
    return simulatedNow ? simulatedNow.toISOString().slice(0, 10) : null;
  }
}
