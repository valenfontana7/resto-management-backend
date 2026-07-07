import { Injectable } from '@nestjs/common';
import { getTaskCapability } from '../../ai-platform/planner/task-capabilities.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialConfigService } from '../config/commercial-config.service';
import type {
  ActionIntelligenceResult,
  CiConfigThresholds,
  CommercialAutonomyLevel,
} from '../types/commercial-intelligence.types';

const FORCE_L0_ACTION_TYPES = new Set([
  'SEND_FIRST_MESSAGE',
  'GENERATE_DEMO',
  'GENERATE_PROSPECT_PACKAGE',
]);

export interface L2EligibilityResult {
  eligible: boolean;
  autonomyLevel: CommercialAutonomyLevel;
  reasons: string[];
}

@Injectable()
export class CommercialAutonomyService {
  constructor(
    private readonly config: CommercialConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isAutoExecuteEnabled(): boolean {
    return process.env.COMMERCIAL_AUTO_EXECUTE === 'true';
  }

  async evaluateL2Eligibility(
    result: ActionIntelligenceResult,
    planTaskKeys?: string[],
  ): Promise<L2EligibilityResult> {
    const reasons: string[] = [];
    const cfg = await this.config.getActive();
    const thresholds = cfg.thresholds;

    if (!this.isAutoExecuteEnabled()) {
      return {
        eligible: false,
        autonomyLevel: 'EXPRESS',
        reasons: ['COMMERCIAL_AUTO_EXECUTE no está activo'],
      };
    }

    if (FORCE_L0_ACTION_TYPES.has(result.actionType)) {
      reasons.push(
        `Acción ${result.actionType} requiere confirmación humana (ADR-001)`,
      );
    }

    const minEv = thresholds.minAutoEvUsd ?? 0.5;
    if (result.expectedValueUsd < minEv) {
      reasons.push(
        `EV USD ${result.expectedValueUsd.toFixed(2)} < mínimo USD ${minEv}`,
      );
    }

    const minConf = thresholds.minAutoConfidence ?? 0.85;
    if (result.confidence < minConf) {
      reasons.push(
        `Confianza ${(result.confidence * 100).toFixed(0)}% < mínimo ${(minConf * 100).toFixed(0)}%`,
      );
    }

    const maxCost = thresholds.maxAutoCostUsd ?? 0.25;
    if (result.estimatedCostUsd > maxCost) {
      reasons.push(
        `Costo USD ${result.estimatedCostUsd.toFixed(3)} > máximo USD ${maxCost}`,
      );
    }

    const budgetOk = await this.checkBudgetRemaining(thresholds);
    if (!budgetOk.ok) {
      reasons.push(budgetOk.reason);
    }

    if (planTaskKeys) {
      const requiresApproval = planTaskKeys.some((key) => {
        try {
          return getTaskCapability(key).requiresApproval;
        } catch {
          return true;
        }
      });
      if (requiresApproval && FORCE_L0_ACTION_TYPES.has(result.actionType)) {
        reasons.push('Plan incluye pasos que requieren aprobación humana');
      }
    } else if (result.taskKey) {
      try {
        if (
          getTaskCapability(result.taskKey).requiresApproval &&
          FORCE_L0_ACTION_TYPES.has(result.actionType)
        ) {
          reasons.push(`Task ${result.taskKey} requiere aprobación`);
        }
      } catch {
        reasons.push('Task desconocida en registry');
      }
    }

    const eligible = reasons.length === 0;
    return {
      eligible,
      autonomyLevel: eligible ? 'AUTO_EXECUTE' : 'EXPRESS',
      reasons,
    };
  }

  private async checkBudgetRemaining(
    thresholds: CiConfigThresholds,
  ): Promise<{ ok: boolean; reason: string }> {
    const budget = await this.prisma.aiCostBudget.findUnique({
      where: { scope: 'global' },
    });
    if (!budget?.monthlyLimitUsd) {
      return { ok: true, reason: '' };
    }

    const monthlyLimit = Number(budget.monthlyLimitUsd);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const spent = await this.prisma.aiTaskExecution.aggregate({
      where: { executedAt: { gte: startOfMonth }, success: true },
      _sum: { totalCostUsd: true },
    });

    const remaining = monthlyLimit - Number(spent._sum.totalCostUsd ?? 0);
    const minPct = thresholds.minBudgetRemainingPct ?? 0.2;
    const ratio = remaining / monthlyLimit;

    if (ratio <= minPct) {
      return {
        ok: false,
        reason: `Presupuesto restante ${Math.round(ratio * 100)}% <= mínimo ${Math.round(minPct * 100)}%`,
      };
    }

    return { ok: true, reason: '' };
  }
}
