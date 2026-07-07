import { BadRequestException, Injectable } from '@nestjs/common';
import { BriefingFeedbackKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { RecordBriefingFeedbackDto } from './dto/briefing-feedback.dto';

/** TTL por defecto de un dismiss: la supresión no es para siempre. */
const DISMISS_TTL_HOURS = 24;

export interface BriefingFeedbackRecord {
  preparationId: string;
  kind: BriefingFeedbackKind;
  snoozedUntil: string | null;
  expiresAt: string;
}

/**
 * Feedback persistente del briefing operativo (dismiss/snooze del
 * Operations Copilot). Alcance por restaurante: el equipo comparte la
 * operación; se audita quién descartó vía createdByUserId.
 */
@Injectable()
export class BriefingFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async getActive(
    restaurantId: string,
    userId: string,
  ): Promise<{ feedback: BriefingFeedbackRecord[] }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const now = new Date();
    await this.prisma.briefingFeedback.deleteMany({
      where: { restaurantId, expiresAt: { lt: now } },
    });

    const rows = await this.prisma.briefingFeedback.findMany({
      where: { restaurantId, expiresAt: { gte: now } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      feedback: rows.map((row) => ({
        preparationId: row.preparationId,
        kind: row.kind,
        snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
  }

  async record(
    restaurantId: string,
    userId: string,
    dto: RecordBriefingFeedbackDto,
  ): Promise<{ feedback: BriefingFeedbackRecord }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const now = new Date();
    let snoozedUntil: Date | null = null;
    let expiresAt: Date;

    if (dto.kind === BriefingFeedbackKind.SNOOZED) {
      if (!dto.snoozedUntil) {
        throw new BadRequestException(
          'snoozedUntil es requerido cuando kind es SNOOZED',
        );
      }
      snoozedUntil = new Date(dto.snoozedUntil);
      if (snoozedUntil.getTime() <= now.getTime()) {
        throw new BadRequestException('snoozedUntil debe ser futuro');
      }
      expiresAt = snoozedUntil;
    } else {
      expiresAt = new Date(now.getTime() + DISMISS_TTL_HOURS * 60 * 60 * 1000);
    }

    const row = await this.prisma.briefingFeedback.upsert({
      where: {
        restaurantId_preparationId: {
          restaurantId,
          preparationId: dto.preparationId,
        },
      },
      create: {
        restaurantId,
        preparationId: dto.preparationId,
        kind: dto.kind,
        snoozedUntil,
        expiresAt,
        createdByUserId: userId,
      },
      update: {
        kind: dto.kind,
        snoozedUntil,
        expiresAt,
        createdByUserId: userId,
      },
    });

    return {
      feedback: {
        preparationId: row.preparationId,
        kind: row.kind,
        snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  }

  async remove(
    restaurantId: string,
    userId: string,
    preparationId: string,
  ): Promise<{ removed: boolean }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const result = await this.prisma.briefingFeedback.deleteMany({
      where: { restaurantId, preparationId },
    });

    return { removed: result.count > 0 };
  }
}
