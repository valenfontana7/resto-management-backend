import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDigestPreferenceDto,
  UpdateDigestPreferenceDto,
} from './dto/digest.dto';

@Injectable()
export class DigestPreferencesService {
  private readonly logger = new Logger(DigestPreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(restaurantId: string) {
    return this.prisma.digestPreference.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(restaurantId: string, dto: CreateDigestPreferenceDto) {
    return this.prisma.digestPreference.upsert({
      where: {
        restaurantId_email: { restaurantId, email: dto.email },
      },
      update: {
        frequency: dto.frequency ?? 'WEEKLY',
        isActive: true,
      },
      create: {
        restaurantId,
        email: dto.email,
        frequency: dto.frequency ?? 'WEEKLY',
      },
    });
  }

  async update(
    restaurantId: string,
    id: string,
    dto: UpdateDigestPreferenceDto,
  ) {
    const pref = await this.prisma.digestPreference.findFirst({
      where: { id, restaurantId },
    });
    if (!pref) throw new NotFoundException('Digest preference not found');
    return this.prisma.digestPreference.update({
      where: { id },
      data: {
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async delete(restaurantId: string, id: string) {
    const pref = await this.prisma.digestPreference.findFirst({
      where: { id, restaurantId },
    });
    if (!pref) throw new NotFoundException('Digest preference not found');
    await this.prisma.digestPreference.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Get all active preferences for a given frequency
   */
  async getActiveByFrequency(frequency: string) {
    return this.prisma.digestPreference.findMany({
      where: { frequency: frequency as any, isActive: true },
      include: {
        restaurant: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async markSent(ids: string[]) {
    await this.prisma.digestPreference.updateMany({
      where: { id: { in: ids } },
      data: { lastSentAt: new Date() },
    });
  }
}
