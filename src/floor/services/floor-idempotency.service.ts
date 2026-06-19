import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FloorIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    restaurantId: string,
    clientMutationId: string | undefined,
    mutationType: string,
    handler: () => Promise<T>,
  ): Promise<T> {
    const key = clientMutationId?.trim();
    if (!key) {
      return handler();
    }

    const existing = await this.prisma.floorClientMutation.findUnique({
      where: {
        restaurantId_clientMutationId: {
          restaurantId,
          clientMutationId: key,
        },
      },
    });

    if (existing) {
      return existing.response as T;
    }

    const response = await handler();

    try {
      await this.prisma.floorClientMutation.create({
        data: {
          restaurantId,
          clientMutationId: key,
          mutationType,
          response: response as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.floorClientMutation.findUnique({
          where: {
            restaurantId_clientMutationId: {
              restaurantId,
              clientMutationId: key,
            },
          },
        });
        if (raced) return raced.response as T;
      }
      throw error;
    }

    return response;
  }
}
