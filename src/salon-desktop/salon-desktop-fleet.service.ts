import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalonDesktopService } from './salon-desktop.service';
import { isSemverNewer } from './semver.util';

@Injectable()
export class SalonDesktopFleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salonDesktop: SalonDesktopService,
  ) {}

  async getFleet(options?: {
    staleMinutes?: number;
    search?: string;
    limit?: number;
  }) {
    const staleMinutes =
      Number.isFinite(options?.staleMinutes) && (options?.staleMinutes ?? 0) > 0
        ? Math.min(Math.floor(options!.staleMinutes!), 24 * 60)
        : 120;
    const limit =
      Number.isFinite(options?.limit) && (options?.limit ?? 0) > 0
        ? Math.min(Math.floor(options!.limit!), 200)
        : 100;
    const search = options?.search?.trim() ?? '';
    const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000);
    const latestRelease = this.salonDesktop.getLatestRelease();

    const terminals = await this.prisma.restaurantTerminal.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                {
                  restaurant: {
                    name: { contains: search, mode: 'insensitive' as const },
                  },
                },
                {
                  restaurant: {
                    slug: { contains: search, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            edgeLocalServer: {
              select: {
                version: true,
                lastHeartbeatAt: true,
                status: true,
                hostname: true,
              },
            },
          },
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    const rows = terminals.map((terminal) => {
      const lastSeenAt = terminal.lastSeenAt?.toISOString() ?? null;
      const isStale =
        !terminal.lastSeenAt ||
        terminal.lastSeenAt.getTime() < staleBefore.getTime();
      const isOutdated = terminal.clientVersion
        ? isSemverNewer(latestRelease.version, terminal.clientVersion)
        : false;
      const edge = terminal.restaurant.edgeLocalServer;

      return {
        id: terminal.id,
        name: terminal.name,
        restaurantId: terminal.restaurantId,
        restaurantName: terminal.restaurant.name,
        restaurantSlug: terminal.restaurant.slug,
        clientVersion: terminal.clientVersion,
        localVersion: terminal.localVersion,
        platform: terminal.platform,
        lastSeenAt,
        isActive: terminal.isActive,
        isStale,
        isOutdated,
        edgeLocal: edge
          ? {
              version: edge.version,
              lastHeartbeatAt: edge.lastHeartbeatAt?.toISOString() ?? null,
              status: edge.status,
              hostname: edge.hostname,
            }
          : null,
      };
    });

    const online = rows.filter((row) => !row.isStale).length;
    const outdated = rows.filter((row) => row.isOutdated).length;

    return {
      latestRelease,
      staleMinutes,
      summary: {
        total: rows.length,
        online,
        stale: rows.length - online,
        outdated,
      },
      terminals: rows,
    };
  }
}
