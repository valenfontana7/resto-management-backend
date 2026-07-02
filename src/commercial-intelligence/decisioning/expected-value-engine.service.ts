import { Injectable } from '@nestjs/common';
import { Lead, LeadStatus } from '@prisma/client';
import { CommercialConfigService } from '../config/commercial-config.service';
import { ActionCostEstimatorService } from '../pricing/action-cost-estimator.service';
import {
  ActionCatalogService,
  type ResolvedAction,
} from '../catalog/action-catalog.service';
import type {
  ActionIntelligenceResult,
  CommercialIntelligenceConfigData,
  RecommendationVerdict,
} from '../types/commercial-intelligence.types';

@Injectable()
export class ExpectedValueEngineService {
  constructor(
    private readonly config: CommercialConfigService,
    private readonly costEstimator: ActionCostEstimatorService,
    private readonly catalog: ActionCatalogService,
  ) {}

  async evaluateLead(
    lead: Lead,
    budgetRemainingUsd?: number | null,
    overrideAction?: ResolvedAction,
    preferredModel?: string,
  ): Promise<ActionIntelligenceResult> {
    const cfg = await this.config.getActive();
    const action = overrideAction ?? this.catalog.resolvePrimaryAction(lead);

    if (!action.taskKey) {
      return this.buildNonTaskResult(lead, action, cfg);
    }

    const cost = await this.costEstimator.estimate({
      taskKey: action.taskKey,
      input: { leadId: lead.id },
      leadId: lead.id,
      budgetRemainingUsd: budgetRemainingUsd ?? undefined,
      preferredModel,
    });

    return this.buildResult(lead, action, cost, cfg, budgetRemainingUsd);
  }

  async evaluateAlternatives(
    lead: Lead,
    primary: ActionIntelligenceResult,
    budgetRemainingUsd?: number | null,
  ): Promise<ActionIntelligenceResult[]> {
    const alts = this.catalog.resolveAlternatives(lead, primary.actionType);
    const results: ActionIntelligenceResult[] = [];

    for (const alt of alts.slice(0, 3)) {
      if (!alt.taskKey) {
        const cfg = await this.config.getActive();
        results.push(this.buildNonTaskResult(lead, alt, cfg));
      } else {
        results.push(await this.evaluateLead(lead, budgetRemainingUsd, alt));
      }
    }

    return results;
  }

  private buildNonTaskResult(
    lead: Lead,
    action: ResolvedAction,
    cfg: CommercialIntelligenceConfigData,
  ): ActionIntelligenceResult {
    const expectedRevenueUsd = this.computeExpectedRevenue(lead, cfg);
    const successProbability = this.computeSuccessProbability(lead, cfg);
    const expectedValueUsd =
      successProbability *
      expectedRevenueUsd *
      (action.actionType === 'WAIT' ? 0.3 : 0);

    const verdict: RecommendationVerdict =
      action.actionType === 'NO_ACTION'
        ? 'NO_ACTION'
        : action.actionType === 'WAIT'
          ? 'WAIT'
          : 'DO_NOW';

    return {
      actionType: action.actionType,
      targetType: 'lead',
      targetId: lead.id,
      label: action.label,
      estimatedCostUsd: 0,
      estimatedDurationMs: 0,
      canReuse: false,
      reuseSavingsUsd: 0,
      successProbability,
      expectedRevenueUsd,
      expectedValueUsd,
      expectedRoi: null,
      confidence: 0.7,
      risk: 0.1,
      priority: this.computePriority({
        ev: expectedValueUsd,
        roi: 0,
        prob: successProbability,
        cost: 0,
        urgency: this.urgencyScore(lead),
        ease: this.easeScore(lead),
        cfg,
      }),
      verdict,
      reason: this.buildReason(lead, action, expectedValueUsd, 0, verdict),
    };
  }

  private buildResult(
    lead: Lead,
    action: ResolvedAction,
    cost: Awaited<ReturnType<ActionCostEstimatorService['estimate']>>,
    cfg: CommercialIntelligenceConfigData,
    budgetRemainingUsd?: number | null,
  ): ActionIntelligenceResult {
    const expectedRevenueUsd = this.computeExpectedRevenue(lead, cfg);
    const successProbability = this.computeSuccessProbability(lead, cfg);
    const riskPenalty =
      cfg.thresholds.riskWeight *
      (1 - successProbability) *
      expectedRevenueUsd *
      0.05;

    const grossEv = successProbability * expectedRevenueUsd;
    const expectedValueUsd = grossEv - cost.costUsd - riskPenalty;
    const expectedRoi =
      cost.costUsd > 0 ? expectedValueUsd / cost.costUsd : null;

    const verdict = this.resolveVerdict(
      action,
      expectedValueUsd,
      cost,
      budgetRemainingUsd,
      cfg,
    );

    const priority = this.computePriority({
      ev: expectedValueUsd,
      roi: expectedRoi ?? 0,
      prob: successProbability,
      cost: cost.costUsd,
      urgency: this.urgencyScore(lead),
      ease: this.easeScore(lead),
      cfg,
    });

    const confidence = Math.min(
      0.95,
      0.5 +
        successProbability * 0.3 +
        (cost.source === 'historical' ? 0.15 : 0),
    );

    return {
      actionType: action.actionType,
      taskKey: action.taskKey,
      targetType: 'lead',
      targetId: lead.id,
      label: `${action.label} — ${lead.businessName}`,
      estimatedCostUsd: cost.costUsd,
      estimatedDurationMs: cost.durationMs,
      selectedModel: cost.model,
      modelSource: cost.modelSource,
      canReuse: cost.canReuse,
      reuseSavingsUsd: cost.reuseSavingsUsd,
      successProbability,
      expectedRevenueUsd,
      expectedValueUsd,
      expectedRoi,
      confidence,
      risk: 1 - successProbability,
      priority,
      verdict,
      reason: this.buildReason(
        lead,
        action,
        expectedValueUsd,
        cost.costUsd,
        verdict,
      ),
    };
  }

  private computeExpectedRevenue(
    lead: Lead,
    cfg: CommercialIntelligenceConfigData,
  ): number {
    let segmentMultiplier = cfg.segments.standard?.multiplier ?? 1;

    if (lead.branchCount > 1) {
      segmentMultiplier *= cfg.segments.multi_branch?.multiplier ?? 1.4;
    }
    if (lead.score > 80) {
      segmentMultiplier *= cfg.segments.premium?.multiplier ?? 1.6;
    }
    if (
      lead.status === LeadStatus.INTERESTED ||
      lead.status === LeadStatus.MEETING_SCHEDULED
    ) {
      segmentMultiplier *= cfg.segments.high_intent?.multiplier ?? 2;
    }

    let signalMultiplier = 1;
    if (!lead.hasWebsite && !lead.website) {
      signalMultiplier *= cfg.signals.no_website?.multiplier ?? 1.15;
    }
    if (!lead.hasOnlineMenu) {
      signalMultiplier *= cfg.signals.no_online_menu?.multiplier ?? 1.1;
    }
    if (lead.hasWhatsapp || lead.whatsapp) {
      signalMultiplier *= cfg.signals.has_whatsapp?.multiplier ?? 1.05;
    }
    signalMultiplier = Math.min(signalMultiplier, 2);

    return (
      cfg.thresholds.baseDealValueUsd * segmentMultiplier * signalMultiplier
    );
  }

  private computeSuccessProbability(
    lead: Lead,
    cfg: CommercialIntelligenceConfigData,
  ): number {
    const w = cfg.thresholds.probabilityWeights;
    const statusScore =
      cfg.thresholds.statusScores[lead.status] ??
      cfg.thresholds.statusScores.NEW ??
      0.15;
    const fitScore = lead.score / 100;
    const channelScore =
      lead.whatsapp || lead.instagram || lead.email ? 0.8 : 0.3;

    const daysSinceUpdate =
      (Date.now() - lead.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore =
      daysSinceUpdate > 30 ? 0.3 : daysSinceUpdate > 7 ? 0.6 : 0.9;

    const raw =
      w.status * statusScore +
      w.fit * fitScore +
      w.channel * channelScore +
      w.recency * recencyScore;

    return Math.min(0.95, Math.max(0.05, raw));
  }

  private urgencyScore(lead: Lead): number {
    if (lead.status === LeadStatus.INTERESTED) return 0.9;
    if (lead.status === LeadStatus.MEETING_SCHEDULED) return 1;
    if (lead.score >= 70) return 0.75;
    return 0.4;
  }

  private easeScore(lead: Lead): number {
    if (lead.whatsapp) return 0.9;
    if (lead.instagram) return 0.75;
    if (lead.email) return 0.6;
    return 0.2;
  }

  private computePriority(params: {
    ev: number;
    roi: number;
    prob: number;
    cost: number;
    urgency: number;
    ease: number;
    cfg: CommercialIntelligenceConfigData;
  }): number {
    const w = params.cfg.weights;
    const normRoi = Math.tanh(params.roi / 10);
    const normEv = Math.tanh(params.ev / 100);
    const normCost = Math.tanh(params.cost / 0.1);

    return (
      w.ev * normEv +
      w.roi * normRoi +
      w.prob * params.prob +
      w.urgency * params.urgency +
      w.ease * params.ease -
      w.cost * normCost
    );
  }

  private resolveVerdict(
    action: ResolvedAction,
    ev: number,
    cost: Awaited<ReturnType<ActionCostEstimatorService['estimate']>>,
    budgetRemainingUsd: number | null | undefined,
    cfg: CommercialIntelligenceConfigData,
  ): RecommendationVerdict {
    if (budgetRemainingUsd != null && cost.costUsd > budgetRemainingUsd) {
      return 'SKIP_BUDGET';
    }
    if (ev < cfg.thresholds.minEvToAct) {
      return 'NO_ACTION';
    }
    if (action.actionType === 'GENERATE_DEMO') {
      return ev > 0 ? 'GENERATE_DEMO' : 'SKIP_DEMO';
    }
    if (cost.modelSource === 'budget_policy') {
      return 'USE_FLASH';
    }
    if (action.actionType === 'WAIT') {
      return 'WAIT';
    }
    return 'DO_NOW';
  }

  private buildReason(
    lead: Lead,
    action: ResolvedAction,
    ev: number,
    costUsd: number,
    verdict: RecommendationVerdict,
  ): string {
    const name = lead.businessName;
    switch (verdict) {
      case 'DO_NOW':
        return `${name} tiene valor esperado de USD ${ev.toFixed(2)} por USD ${costUsd.toFixed(3)} de costo. Conviene ${action.label.toLowerCase()} hoy.`;
      case 'GENERATE_DEMO':
        return `${name} no tiene web y score alto (${lead.score}). Una demo aumenta probabilidad de respuesta. EV: USD ${ev.toFixed(2)}.`;
      case 'SKIP_DEMO':
        return `Generar demo para ${name} no justifica el costo con el valor esperado actual (USD ${ev.toFixed(2)}).`;
      case 'SKIP_BUDGET':
        return `Presupuesto insuficiente para ${action.label.toLowerCase()} en ${name} (costo USD ${costUsd.toFixed(3)}).`;
      case 'USE_FLASH':
        return `Conviene usar modelo económico (Flash) para ${name}: buen balance costo/resultado.`;
      case 'WAIT':
        return `Esperar antes de contactar a ${name}. Contacto reciente o timing subóptimo.`;
      case 'NO_ACTION':
        return `No conviene gastar presupuesto en ${name} ahora. Valor esperado: USD ${ev.toFixed(2)}.`;
      default:
        return `Evaluación comercial para ${name}.`;
    }
  }
}
