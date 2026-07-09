import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { projectTacticSimulation } from '../utils/tactic-simulation.utils';

@Injectable()
export class TacticSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async simulate(
    restaurantId: string,
    userId: string,
    input: {
      situationType: string;
      tacticSummary: string;
      dayOfWeek?: number;
      hour?: number;
      horizonDays?: number;
    },
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const since = new Date();
    since.setDate(since.getDate() - (input.horizonDays ?? 90));

    const episodes = await this.prisma.operationalEpisode.findMany({
      where: {
        restaurantId,
        createdAt: { gte: since },
      },
      select: {
        situationId: true,
        outcome: true,
        closedAt: true,
      },
      take: 300,
    });

    const projection = projectTacticSimulation({
      situationType: input.situationType,
      tacticSummary: input.tacticSummary,
      dayOfWeek: input.dayOfWeek,
      hour: input.hour,
      episodes: episodes.map((episode) => ({
        situationType: episode.situationId,
        outcome: episode.outcome as {
          status?: string;
          summary?: string | null;
          measuredImpact?: {
            metric: string;
            valueBefore?: number;
            valueAfter?: number;
            unit?: string;
          } | null;
        },
        closedAt: episode.closedAt,
      })),
    });

    return { projection };
  }
}
