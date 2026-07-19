import { Inject, Injectable, Optional } from '@nestjs/common';
import { SimulationRunStatus } from '@prisma/client';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import { PrismaService } from '../../prisma/prisma.service';

export const LAB_CLEANUP_ENV = 'BENTOO_LAB_CLEANUP_ENV';

@Injectable()
export class SimulationCleanupService {
  private readonly env: Record<string, string | undefined>;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(LAB_CLEANUP_ENV)
    env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  async cleanup(runId: string, options: { removeRun: boolean }): Promise<void> {
    if (!isLabRuntime(this.env)) {
      throw new Error('Cleanup disponible únicamente en runtime Lab');
    }

    const run = await this.prisma.simulationRun.findUnique({
      where: { id: runId },
      include: { restaurant: { select: { id: true, slug: true } } },
    });
    if (!run) {
      throw new Error(`Ejecución Lab inexistente: ${runId}`);
    }
    if (!run.restaurantId || !run.restaurant) {
      if (options.removeRun) {
        await this.prisma.simulationRun.delete({ where: { id: runId } });
      }
      return;
    }
    if (!run.restaurant.slug.startsWith('lab-')) {
      throw new Error(
        `Cleanup rechazado: el slug ${run.restaurant.slug} no pertenece a Lab`,
      );
    }

    const restaurantId = run.restaurantId;
    await this.prisma.simulationRun.update({
      where: { id: runId },
      data: { status: SimulationRunStatus.CLEANING },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        const customerProfiles = await tx.restaurantCustomerProfile.findMany({
          where: { restaurantId },
          select: { identityId: true },
        });
        const identityIds = customerProfiles.map(
          (profile) => profile.identityId,
        );

        await tx.adminAuditLog.deleteMany({
          where: { targetRestaurantId: restaurantId },
        });
        await tx.analytics.deleteMany({ where: { restaurantId } });
        await tx.operationalOutbox.deleteMany({ where: { restaurantId } });
        await tx.businessEvent.deleteMany({ where: { restaurantId } });
        await tx.orderInventoryDeduction.deleteMany({
          where: { restaurantId },
        });
        await tx.restaurantMembership.deleteMany({ where: { restaurantId } });
        await tx.restaurant.delete({ where: { id: restaurantId } });

        if (identityIds.length > 0) {
          await tx.customerIdentity.deleteMany({
            where: {
              id: { in: identityIds },
              profiles: { none: {} },
            },
          });
        }
      });

      const residueCounts = await Promise.all([
        this.prisma.restaurant.count({ where: { id: restaurantId } }),
        this.prisma.user.count({ where: { restaurantId } }),
        this.prisma.role.count({ where: { restaurantId } }),
        this.prisma.restaurantMembership.count({ where: { restaurantId } }),
        this.prisma.category.count({ where: { restaurantId } }),
        this.prisma.dish.count({ where: { restaurantId } }),
        this.prisma.order.count({ where: { restaurantId } }),
        this.prisma.checkoutSession.count({ where: { restaurantId } }),
        this.prisma.restaurantCustomerProfile.count({
          where: { restaurantId },
        }),
        this.prisma.notification.count({ where: { restaurantId } }),
        this.prisma.businessEvent.count({ where: { restaurantId } }),
        this.prisma.operationalOutbox.count({ where: { restaurantId } }),
        this.prisma.analytics.count({ where: { restaurantId } }),
        this.prisma.inventoryItem.count({ where: { restaurantId } }),
        this.prisma.dishRecipeLine.count({
          where: { dish: { restaurantId } },
        }),
        this.prisma.orderInventoryDeduction.count({ where: { restaurantId } }),
      ]);
      const residueCount = residueCounts.reduce(
        (total, count) => total + count,
        0,
      );
      if (residueCount > 0) {
        throw new Error(
          `Cleanup incompleto para ${restaurantId}: ${residueCount} filas`,
        );
      }

      if (options.removeRun) {
        await this.prisma.simulationRun.delete({ where: { id: runId } });
      } else {
        await this.prisma.simulationRun.update({
          where: { id: runId },
          data: {
            status: SimulationRunStatus.STOPPED,
            restaurantId: null,
            completedAt: new Date(),
          },
        });
      }
    } catch (error) {
      await this.prisma.simulationRun
        .update({
          where: { id: runId },
          data: { status: SimulationRunStatus.CLEANUP_FAILED },
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
