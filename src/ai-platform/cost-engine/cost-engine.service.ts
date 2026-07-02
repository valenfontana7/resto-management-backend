import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TokenUsage } from '../types/ai-task.types';

export interface CostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  reasoningCostUsd: number;
  totalCostUsd: number;
}

@Injectable()
export class CostEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateCost(
    provider: AiProvider,
    model: string,
    usage: TokenUsage,
  ): Promise<CostBreakdown> {
    const pricing = await this.prisma.aiModelPricing.findFirst({
      where: {
        provider,
        model,
        isActive: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!pricing) {
      return {
        inputCostUsd: 0,
        outputCostUsd: 0,
        reasoningCostUsd: 0,
        totalCostUsd: 0,
      };
    }

    const inputPerMillion = Number(pricing.inputPerMillion);
    const outputPerMillion = Number(pricing.outputPerMillion);
    const reasoningPerMillion = pricing.reasoningPerMillion
      ? Number(pricing.reasoningPerMillion)
      : 0;

    const inputCostUsd = (usage.promptTokens / 1_000_000) * inputPerMillion;
    const outputCostUsd =
      (usage.completionTokens / 1_000_000) * outputPerMillion;
    const reasoningCostUsd =
      ((usage.reasoningTokens ?? 0) / 1_000_000) * reasoningPerMillion;

    return {
      inputCostUsd,
      outputCostUsd,
      reasoningCostUsd,
      totalCostUsd: inputCostUsd + outputCostUsd + reasoningCostUsd,
    };
  }

  async assertBudget(scope: string, estimatedCostUsd = 0): Promise<void> {
    const budget = await this.prisma.aiCostBudget.findUnique({
      where: { scope },
    });
    if (!budget?.hardStop) return;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailySpend, monthlySpend] = await Promise.all([
      this.sumSpendSince(startOfDay, scope),
      this.sumSpendSince(startOfMonth, scope),
    ]);

    if (
      budget.dailyLimitUsd &&
      dailySpend + estimatedCostUsd > Number(budget.dailyLimitUsd)
    ) {
      throw new HttpException(
        {
          message: 'Presupuesto diario de IA excedido',
          code: 'AI_BUDGET_DAILY_EXCEEDED',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (
      budget.monthlyLimitUsd &&
      monthlySpend + estimatedCostUsd > Number(budget.monthlyLimitUsd)
    ) {
      throw new HttpException(
        {
          message: 'Presupuesto mensual de IA excedido',
          code: 'AI_BUDGET_MONTHLY_EXCEEDED',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private async sumSpendSince(since: Date, scope: string): Promise<number> {
    const where: Prisma.AiTaskExecutionWhereInput = {
      executedAt: { gte: since },
      success: true,
    };

    if (scope === 'global') {
      // all executions
    } else if (scope.startsWith('user:')) {
      where.userId = scope.slice('user:'.length);
    } else if (scope.startsWith('campaign:')) {
      where.savedSearchId = scope.slice('campaign:'.length);
    }

    const result = await this.prisma.aiTaskExecution.aggregate({
      where,
      _sum: { totalCostUsd: true },
    });

    return Number(result._sum.totalCostUsd ?? 0);
  }
}
