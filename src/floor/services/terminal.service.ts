import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { OwnershipService } from '../../common/services/ownership.service';

import {
  CreateTerminalDto,
  PingTerminalDto,
  UpdateTerminalDto,
} from '../dto/terminal.dto';

@Injectable()
export class TerminalService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly ownership: OwnershipService,
  ) {}

  async list(restaurantId: string, userId: string, includeInactive = false) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const terminals = await this.prisma.restaurantTerminal.findMany({
      where: {
        restaurantId,

        ...(includeInactive ? {} : { isActive: true }),
      },

      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return { terminals: terminals.map((t) => this.formatTerminal(t)) };
  }

  async create(restaurantId: string, userId: string, dto: CreateTerminalDto) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const name = dto.name.trim();

    const existing = await this.prisma.restaurantTerminal.findUnique({
      where: { restaurantId_name: { restaurantId, name } },
    });

    if (existing) {
      throw new BadRequestException('Ya existe una terminal con ese nombre');
    }

    const terminal = await this.prisma.restaurantTerminal.create({
      data: {
        restaurantId,

        name,

        lastSeenAt: new Date(),
      },
    });

    return { terminal: this.formatTerminal(terminal) };
  }

  async update(
    restaurantId: string,

    terminalId: string,

    userId: string,

    dto: UpdateTerminalDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    await this.findTerminalOrThrow(restaurantId, terminalId);

    if (dto.name) {
      const name = dto.name.trim();

      const duplicate = await this.prisma.restaurantTerminal.findFirst({
        where: {
          restaurantId,

          name,

          NOT: { id: terminalId },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Ya existe una terminal con ese nombre');
      }
    }

    const terminal = await this.prisma.restaurantTerminal.update({
      where: { id: terminalId },

      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),

        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return { terminal: this.formatTerminal(terminal) };
  }

  async ping(
    restaurantId: string,
    terminalId: string,
    userId: string,
    dto?: PingTerminalDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const terminal = await this.findTerminalOrThrow(restaurantId, terminalId);

    if (!terminal.isActive) {
      throw new BadRequestException('La terminal está desactivada');
    }

    const updated = await this.prisma.restaurantTerminal.update({
      where: { id: terminalId },

      data: {
        lastSeenAt: new Date(),
        ...(dto?.clientVersion !== undefined
          ? { clientVersion: dto.clientVersion.trim() || null }
          : {}),
        ...(dto?.localVersion !== undefined
          ? { localVersion: dto.localVersion.trim() || null }
          : {}),
        ...(dto?.platform !== undefined
          ? { platform: dto.platform.trim() || null }
          : {}),
      },
    });

    return { terminal: this.formatTerminal(updated) };
  }

  async deactivate(restaurantId: string, terminalId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    await this.findTerminalOrThrow(restaurantId, terminalId);

    const terminal = await this.prisma.restaurantTerminal.update({
      where: { id: terminalId },

      data: { isActive: false },
    });

    return { terminal: this.formatTerminal(terminal) };
  }

  async resolveActiveTerminal(
    restaurantId: string,

    terminalId?: string | null,
  ) {
    if (!terminalId) return null;

    const terminal = await this.prisma.restaurantTerminal.findFirst({
      where: { id: terminalId, restaurantId, isActive: true },
    });

    if (!terminal) {
      throw new BadRequestException('Terminal no válida o inactiva');
    }

    return terminal;
  }

  private async findTerminalOrThrow(restaurantId: string, terminalId: string) {
    const terminal = await this.prisma.restaurantTerminal.findFirst({
      where: { id: terminalId, restaurantId },
    });

    if (!terminal) {
      throw new NotFoundException('Terminal no encontrada');
    }

    return terminal;
  }

  private formatTerminal(terminal: {
    id: string;

    name: string;

    isActive: boolean;

    lastSeenAt: Date | null;

    clientVersion: string | null;

    localVersion: string | null;

    platform: string | null;

    createdAt: Date;

    updatedAt: Date;
  }) {
    return {
      id: terminal.id,

      name: terminal.name,

      isActive: terminal.isActive,

      lastSeenAt: terminal.lastSeenAt,

      clientVersion: terminal.clientVersion,

      localVersion: terminal.localVersion,

      platform: terminal.platform,

      createdAt: terminal.createdAt,

      updatedAt: terminal.updatedAt,
    };
  }
}
