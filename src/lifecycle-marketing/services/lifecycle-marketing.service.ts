import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DecisionEngineOrchestratorService } from '../../decision-engine/decision-engine-orchestrator.service';
import { CampaignRegistry } from './campaign-registry.service';
import { CampaignEvaluator } from './campaign-evaluator.service';
import { TemplateResolver } from './template-resolver.service';
import { PersonalizationResolver } from './personalization-resolver.service';
import { CampaignScheduler } from './campaign-scheduler.service';
import { OutcomeCollector } from './outcome-collector.service';
import { LifecycleContextLoader } from './lifecycle-context.loader';
import { LifecyclePersistenceService } from '../stores/lifecycle-persistence.service';
import { resolveLifecycleRecipient } from '../lib/lifecycle-recipient.util';
import {
  LIFECYCLE_MARKETING_ENGINE_VERSION,
  type LifecycleCampaignPlanResult,
  type LifecycleCampaignType,
  type LifecycleCampaignEvaluationResult,
  type LifecycleScheduledDeliveryPreview,
} from '../types/campaign.types';
import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';

@Injectable()
export class LifecycleMarketingService {
  private readonly logger = new Logger(LifecycleMarketingService.name);

  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
    private readonly registry: CampaignRegistry,
    private readonly evaluator: CampaignEvaluator,
    private readonly templateResolver: TemplateResolver,
    private readonly personalization: PersonalizationResolver,
    private readonly scheduler: CampaignScheduler,
    private readonly outcomes: OutcomeCollector,
    private readonly contextLoader: LifecycleContextLoader,
    private readonly persistence: LifecyclePersistenceService,
  ) {}

  async planForRestaurant(
    restaurantId: string,
    options?: { dryRun?: boolean; refreshIntelligence?: boolean },
  ): Promise<LifecycleCampaignPlanResult> {
    const bundle = await this.orchestrator.getSnapshot(restaurantId, {
      refresh: options?.refreshIntelligence ?? false,
    });

    if (!bundle || bundle.status !== 'ready' || !bundle.snapshot) {
      return {
        contractVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
        restaurantId,
        computedAt: new Date().toISOString(),
        bundleStatus: bundle?.status ?? 'none',
        recommendationsConsidered: 0,
        evaluations: [],
        scheduledDeliveries: [],
        skipped: [
          { campaignId: '*', reason: 'Intelligence bundle no disponible' },
        ],
      };
    }

    const evaluations: LifecycleCampaignEvaluationResult[] = [];
    const scheduledDeliveries: LifecycleScheduledDeliveryPreview[] = [];
    const skipped: Array<{ campaignId: string; reason: string }> = [];
    const processedCampaigns = new Set<string>();

    for (const recommendation of bundle.recommendations) {
      const evalResult = await this.evaluator.evaluateForRecommendation(
        bundle,
        recommendation.code,
      );
      if (!evalResult) {
        skipped.push({
          campaignId: '*',
          reason: `Sin campaña LCM para REC ${recommendation.code}`,
        });
        continue;
      }

      evaluations.push(evalResult);
      processedCampaigns.add(evalResult.campaignId);

      if (!evalResult.shouldCommunicate) {
        skipped.push({
          campaignId: evalResult.campaignId,
          reason: evalResult.reason,
        });
        if (!options?.dryRun) {
          await this.persistRun(
            restaurantId,
            evalResult,
            bundle,
            recommendation,
          );
        }
        continue;
      }

      const preview = await this.scheduleEvaluation({
        restaurantId,
        evalResult,
        bundle,
        recommendation,
        dryRun: options?.dryRun ?? false,
      });
      if (preview) scheduledDeliveries.push(preview);
    }

    const oppEvaluations =
      await this.evaluator.evaluateOpportunityCampaigns(bundle);
    for (const evalResult of oppEvaluations) {
      if (processedCampaigns.has(evalResult.campaignId)) continue;
      evaluations.push(evalResult);

      if (!evalResult.shouldCommunicate) {
        skipped.push({
          campaignId: evalResult.campaignId,
          reason: evalResult.reason,
        });
        continue;
      }

      const preview = await this.scheduleEvaluation({
        restaurantId,
        evalResult,
        bundle,
        recommendation: null,
        dryRun: options?.dryRun ?? false,
      });
      if (preview) scheduledDeliveries.push(preview);
    }

    return {
      contractVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
      restaurantId,
      computedAt: new Date().toISOString(),
      bundleStatus: bundle.status,
      recommendationsConsidered: bundle.recommendations.length,
      evaluations,
      scheduledDeliveries,
      skipped,
    };
  }

  async processCampaignFollowUp(input: {
    restaurantId: string;
    campaignId: string;
    stepIndex: number;
    recommendationCode: string | null;
    opportunityCode: string | null;
  }): Promise<void> {
    let bundle = await this.orchestrator.getSnapshot(input.restaurantId);
    if (!bundle?.snapshot) {
      bundle = await this.orchestrator.evaluateRestaurant(input.restaurantId);
    }

    const campaign = this.registry.getCampaign(input.campaignId);
    if (!campaign || !bundle.snapshot) return;

    const recommendation =
      bundle.recommendations.find((r) => r.code === input.recommendationCode) ??
      this.buildFollowUpRecommendation(input);

    const evalResult = await this.evaluator.evaluateCampaign({
      campaign,
      bundle,
      stepIndex: input.stepIndex,
    });

    if (!evalResult.shouldCommunicate) {
      this.logger.debug(
        `Follow-up ${input.campaignId} paso ${input.stepIndex} suprimido: ${evalResult.reason}`,
      );
      return;
    }

    await this.scheduleEvaluation({
      restaurantId: input.restaurantId,
      evalResult,
      bundle,
      recommendation,
      dryRun: false,
    });
  }

  listCampaigns() {
    return this.registry.listCampaigns();
  }

  listTemplates() {
    return this.templateResolver.listTemplates();
  }

  listDeliveries(restaurantId: string) {
    return this.persistence.listDeliveriesForRestaurant(restaurantId);
  }

  listOutcomes(restaurantId: string) {
    return this.outcomes.listForRestaurant(restaurantId);
  }

  getDashboardStats(days = 7) {
    return this.persistence.getDashboardStats(days);
  }

  listRecentDeliveriesGlobal(limit = 30) {
    return this.persistence.listRecentDeliveriesGlobal(limit);
  }

  listActiveCampaigns(restaurantId: string) {
    return this.persistence.listActiveCampaignTypes(restaurantId);
  }

  listCalendar(from: Date, to: Date) {
    return this.persistence.listScheduledCalendar(from, to);
  }

  private async scheduleEvaluation(input: {
    restaurantId: string;
    evalResult: Awaited<
      ReturnType<CampaignEvaluator['evaluateForRecommendation']>
    > & { campaignId: string; shouldCommunicate: boolean };
    bundle: NonNullable<
      Awaited<ReturnType<DecisionEngineOrchestratorService['getSnapshot']>>
    >;
    recommendation: DetectedRecommendation | null;
    dryRun: boolean;
  }): Promise<LifecycleScheduledDeliveryPreview | null> {
    const { evalResult, bundle, recommendation, dryRun } = input;
    if (!evalResult?.shouldCommunicate || !evalResult.selectedStep) return null;

    const campaign = this.registry.getCampaign(evalResult.campaignId);
    if (!campaign) return null;

    const template = await this.templateResolver.resolve(
      evalResult.selectedStep.templateId,
    );
    if (!template) {
      this.logger.warn(
        `Template ${evalResult.selectedStep.templateId} not found`,
      );
      return null;
    }

    const personalization = await this.contextLoader.loadPersonalizationContext(
      input.restaurantId,
      bundle.snapshot!,
      recommendation,
      campaign.expectedOutcome,
    );

    const message = this.personalization.render(
      template,
      evalResult.selectedStep.channel,
      personalization,
    );

    const runId = randomUUID();
    if (!dryRun) {
      await this.persistRun(
        input.restaurantId,
        evalResult,
        bundle,
        recommendation,
        runId,
      );
      await this.persistence.upsertActiveCampaign({
        restaurantId: input.restaurantId,
        campaignId: campaign.id,
        campaignType: campaign.type,
        sourceRecommendationCode: evalResult.recommendationCode,
        sourceOpportunityCode: evalResult.opportunityCode,
        currentStepIndex:
          campaign.steps.findIndex(
            (s) => s.stepId === evalResult.selectedStep!.stepId,
          ) ?? 0,
      });
    }

    const { preview, delivery } = await this.scheduler.schedule({
      restaurantId: input.restaurantId,
      campaignRunId: runId,
      campaignId: campaign.id,
      campaignType: campaign.type,
      stepId: evalResult.selectedStep.stepId,
      recommendationCode: evalResult.recommendationCode,
      opportunityCode: evalResult.opportunityCode,
      templateId: template.id,
      channel: evalResult.selectedStep.channel,
      message,
      delayDays: evalResult.selectedStep.delayDays,
      recipient: resolveLifecycleRecipient(
        evalResult.selectedStep.channel,
        personalization,
      ),
      dryRun,
    });

    if (delivery && !dryRun) {
      await this.outcomes.registerPending(delivery.id);
    }

    return preview;
  }

  private async persistRun(
    restaurantId: string,
    evalResult: {
      campaignId: string;
      campaignType: LifecycleCampaignType;
      shouldCommunicate: boolean;
      reason: string;
      intelligenceBacked: boolean;
      recommendationCode: string | null;
      opportunityCode: string | null;
      selectedChannel: string | null;
      selectedTemplateId: string | null;
    },
    bundle: NonNullable<
      Awaited<ReturnType<DecisionEngineOrchestratorService['getSnapshot']>>
    >,
    recommendation: DetectedRecommendation | null,
    runId?: string,
  ): Promise<void> {
    await this.persistence.saveCampaignRun({
      id: runId ?? randomUUID(),
      restaurantId,
      campaignId: evalResult.campaignId,
      campaignType: evalResult.campaignType,
      recommendationCode: evalResult.recommendationCode,
      opportunityCode: evalResult.opportunityCode,
      shouldCommunicate: evalResult.shouldCommunicate,
      reason: evalResult.reason,
      intelligenceBacked: evalResult.intelligenceBacked,
      channel: evalResult.selectedChannel,
      templateId: evalResult.selectedTemplateId,
      trace: {
        engineVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
        bundleComputedAt: bundle.computedAt,
        recommendationTitle: recommendation?.title ?? null,
        rss: bundle.snapshot?.rss.value ?? null,
        rssBand: bundle.snapshot?.rss.band ?? null,
      },
      engineVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
    });
  }

  private buildFollowUpRecommendation(input: {
    recommendationCode: string | null;
    campaignId: string;
  }): DetectedRecommendation {
    const code = input.recommendationCode ?? 'LCM-FOLLOWUP';
    return {
      id: randomUUID(),
      code,
      strategy: 'assist',
      priority: 'medium',
      confidence: 'medium',
      title: code,
      summary: '',
      explanation: '',
      opportunityIds: [],
      signalIds: [],
      rssDimensions: [],
      expectedOutcome: '',
      recommendedJourneyType: 'retention',
      estimatedImpact: {
        rssDeltaRange: '0-5',
        outcome: 'followup',
        timeframe: '7d',
      },
      estimatedEffort: 'minutes',
      primaryJob: '',
      consumerHints: { journeyId: input.campaignId },
      principles: [],
      createdAt: new Date().toISOString(),
      ruleVersion: LIFECYCLE_MARKETING_ENGINE_VERSION,
      ruleId: 'campaign-step-followup',
    };
  }
}
