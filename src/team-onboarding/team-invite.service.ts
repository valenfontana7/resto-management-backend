import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

@Injectable()
export class TeamInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async createInvite(
    restaurantId: string,
    userId: string,
    options?: { roleCode?: string; label?: string; ttlHours?: number },
  ) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

    const pin = generatePin();
    const pinHash = await bcrypt.hash(pin, 10);
    const ttlHours = options?.ttlHours ?? 48;

    const invite = await this.prisma.teamInvite.create({
      data: {
        restaurantId,
        pinHash,
        roleCode: options?.roleCode ?? 'WAITER',
        label: options?.label ?? 'Invitación de equipo',
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
        createdById: userId,
      },
    });

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, name: true },
    });

    const joinUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/admin/join?restaurant=${restaurant?.slug ?? restaurantId}&invite=${invite.id}`;

    return {
      inviteId: invite.id,
      pin,
      joinUrl,
      qrPayload: joinUrl,
      expiresAt: invite.expiresAt.toISOString(),
      roleCode: invite.roleCode,
      label: invite.label,
    };
  }

  async redeemInvite(params: {
    inviteId: string;
    pin: string;
    userId: string;
    restaurantId: string;
  }) {
    const invite = await this.prisma.teamInvite.findFirst({
      where: {
        id: params.inviteId,
        restaurantId: params.restaurantId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      throw new NotFoundException('Invitación inválida o expirada');
    }

    const valid = await bcrypt.compare(params.pin, invite.pinHash);
    if (!valid) {
      throw new BadRequestException('PIN incorrecto');
    }

    await this.prisma.$transaction([
      this.prisma.teamInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedByUserId: params.userId },
      }),
      this.prisma.user.update({
        where: { id: params.userId },
        data: { restaurantId: params.restaurantId },
      }),
    ]);

    return { success: true, roleCode: invite.roleCode };
  }

  async listActiveInvites(restaurantId: string, userId: string) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);
    return this.prisma.teamInvite.findMany({
      where: {
        restaurantId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        roleCode: true,
        label: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
