import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertAiBudgetDto } from '../dto/ai-budget.dto';

@Injectable()
export class AiBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.aiCostBudget.findMany({ orderBy: { scope: 'asc' } });
  }

  upsert(dto: UpsertAiBudgetDto) {
    return this.prisma.aiCostBudget.upsert({
      where: { scope: dto.scope },
      create: {
        scope: dto.scope,
        dailyLimitUsd: dto.dailyLimitUsd,
        monthlyLimitUsd: dto.monthlyLimitUsd,
        hardStop: dto.hardStop ?? true,
      },
      update: {
        dailyLimitUsd: dto.dailyLimitUsd,
        monthlyLimitUsd: dto.monthlyLimitUsd,
        hardStop: dto.hardStop,
      },
    });
  }
}
