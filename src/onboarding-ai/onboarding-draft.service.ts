import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OnboardingDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const draft = await this.prisma.onboardingDraft.findUnique({
      where: { userId },
    });
    if (!draft) return null;
    return {
      data: draft.data,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
    };
  }

  async upsert(userId: string, data: Prisma.InputJsonValue) {
    const draft = await this.prisma.onboardingDraft.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
    return {
      data: draft.data,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
    };
  }

  async remove(userId: string) {
    await this.prisma.onboardingDraft.deleteMany({ where: { userId } });
    return { ok: true };
  }
}
