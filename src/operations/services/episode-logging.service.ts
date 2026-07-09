import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CoordinationResult } from '../types/operations.types';
import { ResolutionMemoryService } from './resolution-memory.service';

@Injectable()
export class EpisodeLoggingService {
  private readonly logger = new Logger(EpisodeLoggingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolutionMemory: ResolutionMemoryService,
  ) {}

  async logCoordinationClosed(input: {
    restaurantId: string;

    shiftId: string;

    businessDate: Date;

    coordinationId: string;

    coordinationType: string;

    participants: unknown;

    result: CoordinationResult;

    wasEscalated: boolean;

    createdAt: Date;

    sourceEventIds?: string[];

    situationType?: string;

    preparationId?: string;

    daypart?: string;
  }): Promise<void> {
    const timeToResolveSeconds = Math.max(
      0,

      Math.round(
        (new Date(input.result.closedAt).getTime() -
          input.createdAt.getTime()) /
          1000,
      ),
    );

    try {
      const episode = await this.prisma.operationalEpisode.create({
        data: {
          restaurantId: input.restaurantId,

          shiftId: input.shiftId,

          businessDate: input.businessDate,

          coordinationId: input.coordinationId,

          coordinationType: input.coordinationType,

          preparationId: input.preparationId,

          situationId: input.situationType,

          participants: input.participants as object,

          outcome: {
            status: input.result.outcome.toLowerCase(),

            measuredImpact: input.result.measuredImpact ?? null,

            timeToResolveSeconds,

            wasEscalated: input.wasEscalated,

            summary: input.result.summary ?? null,
          },

          sourceEventIds: input.sourceEventIds ?? [],

          closedAt: new Date(input.result.closedAt),
        },
      });

      await this.resolutionMemory.recordFromEpisode({
        restaurantId: input.restaurantId,

        episodeId: episode.id,

        situationType: input.situationType,

        daypart: input.daypart,

        outcome: input.result.outcome,

        summary: input.result.summary,

        measuredImpact: input.result.measuredImpact,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log episode for coordination ${input.coordinationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
