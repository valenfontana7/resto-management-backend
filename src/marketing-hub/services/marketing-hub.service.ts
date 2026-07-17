import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import {
  MarketingDirectorService,
  WINBACK_CAMPAIGN_ID,
} from '../../lifecycle-marketing/services/marketing-director.service';
import { LifecycleMarketingService } from '../../lifecycle-marketing/services/lifecycle-marketing.service';
import { TemplateOverrideService } from '../../lifecycle-marketing/services/template-override.service';
import { EngagementEngineService } from '../../customer-engagement/services/engagement-engine.service';
import { RestaurantRefResolverService } from '../../customer-engagement/services/restaurant-ref-resolver.service';
import { DecisionEngineOrchestratorService } from '../../decision-engine/decision-engine-orchestrator.service';
import { listCampaigns } from '../../lifecycle-marketing/catalog/campaign-catalog.loader';
import { listTemplates as listLcmTemplates } from '../../lifecycle-marketing/catalog/template-catalog.loader';
import { listJourneys } from '../../customer-engagement/catalog/journey-catalog.loader';
import { listTemplates as listCeTemplates } from '../../customer-engagement/catalog/template-catalog.loader';
import { MarketingSegmentsService } from './marketing-segments.service';
import {
  MarketingDeliveriesQueryService,
  type MarketingDeliveriesQuery,
} from './marketing-deliveries-query.service';
import { CampaignOverrideService } from '../../lifecycle-marketing/services/campaign-override.service';

const ONBOARDING_FLOW = [
  { id: 'LCM-WELCOME-01', label: 'Bienvenida', type: 'WELCOME' },
  { id: 'LCM-ACTIVATION-01', label: 'Configurar menú', type: 'ACTIVATION' },
  { id: 'LCM-ACTIVATION-02', label: 'Publicar sitio', type: 'ACTIVATION' },
  { id: 'LCM-FIRST-VALUE-01', label: 'Primer pedido', type: 'FIRST_VALUE' },
  { id: 'LCM-MILESTONE-01', label: 'Celebración', type: 'MILESTONE' },
  { id: 'LCM-NPS-01', label: 'Pedido de reseña', type: 'NPS' },
] as const;

const TEMPLATE_GROUP_RULES: Array<{
  group: string;
  match: (ctx: TemplateGroupCtx) => boolean;
}> = [
  {
    group: 'Bienvenida',
    match: (c) => c.types.includes('WELCOME') || c.trigger.includes('welcome'),
  },
  {
    group: 'Activación',
    match: (c) =>
      c.types.some((t) =>
        ['ACTIVATION', 'ONBOARDING', 'FIRST_VALUE'].includes(t),
      ) ||
      c.trigger.includes('activation') ||
      c.trigger.includes('golive'),
  },
  {
    group: 'Recuperación',
    match: (c) =>
      c.types.some((t) =>
        ['WINBACK', 'RECOVERY', 'INACTIVITY', 'CHURN_PREVENTION'].includes(t),
      ) ||
      c.trigger.includes('recover') ||
      c.trigger.includes('inactiv') ||
      c.trigger.includes('risk'),
  },
  {
    group: 'Celebración',
    match: (c) =>
      c.types.includes('MILESTONE') ||
      c.types.includes('CELEBRATION') ||
      c.trigger.includes('celebrat') ||
      c.trigger.includes('milestone'),
  },
  {
    group: 'Referidos',
    match: (c) =>
      c.types.includes('REFERRAL') || c.trigger.includes('referral'),
  },
  {
    group: 'Renovación',
    match: (c) => c.types.includes('RENEWAL') || c.trigger.includes('renew'),
  },
  {
    group: 'Riesgo',
    match: (c) =>
      c.types.includes('CHURN_PREVENTION') ||
      c.trigger.includes('churn') ||
      c.trigger.includes('save'),
  },
  { group: 'Educación', match: () => true },
];

interface TemplateGroupCtx {
  types: string[];
  trigger: string;
}

@Injectable()
export class MarketingHubService {
  private readonly planPrices: Record<string, number> = {
    STARTER: 0,
    PROFESSIONAL: 29900,
    ENTERPRISE: 79900,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly director: MarketingDirectorService,
    private readonly lifecycle: LifecycleMarketingService,
    private readonly templateOverrides: TemplateOverrideService,
    private readonly campaignOverrides: CampaignOverrideService,
    private readonly engagement: EngagementEngineService,
    private readonly restaurantRef: RestaurantRefResolverService,
    private readonly orchestrator: DecisionEngineOrchestratorService,
    private readonly segments: MarketingSegmentsService,
    private readonly deliveriesQuery: MarketingDeliveriesQueryService,
  ) {}

  async getDashboard(days = 7) {
    const safeDays = this.clampDays(days);
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    const [
      segments,
      commandCenter,
      lcmStats,
      ceStats,
      winback,
      billing,
      recoveredCount,
      careQueue,
    ] = await Promise.all([
      this.segments.getRestaurantSegments(),
      this.director.getCommandCenter(),
      this.lifecycle.getDashboardStats(safeDays),
      this.engagement.getDashboardStats(safeDays),
      this.director.getCampaignPerformance(WINBACK_CAMPAIGN_ID, safeDays),
      this.getBillingSnapshot(),
      this.countRecoveredRestaurants(since),
      this.segments.getCareQueue(12),
    ]);

    const avgPlanMrr =
      billing.paidAccounts > 0
        ? billing.estimatedMrr / billing.paidAccounts
        : 0;
    const estimatedMrrRecovered = (recoveredCount * avgPlanMrr) / 100;

    const activationRate = this.computeActivationRate(lcmStats, ceStats);
    const retentionRate = await this.computeRetentionRate();
    const recoveryRate = winback.recoveryRate;
    const referralRate = await this.computeReferralRate(since);

    return {
      generatedAt: new Date().toISOString(),
      periodDays: safeDays,
      segments,
      communications: {
        emailsToday: commandCenter.kpis.emailsToday,
        emailsTodayDelta: commandCenter.kpis.emailsTodayDelta,
        activeCampaignInstances: commandCenter.kpis.activeCampaignInstances,
        uniqueCampaignsRunning: commandCenter.kpis.uniqueCampaignsRunning,
        winbackActive: winback.sent,
        openRate7d: commandCenter.kpis.openRate7d,
      },
      rates: {
        activationRate,
        retentionRate,
        recoveryRate,
        referralRate,
        openRate: this.mergeRates(lcmStats.openRate, ceStats),
        clickRate: lcmStats.clickRate,
        journeyCompletionRate: lcmStats.journeyCompletionRate,
      },
      impact: {
        estimatedMrr: billing.estimatedMrr / 100,
        estimatedMrrRecovered,
        recoveredRestaurants: recoveredCount,
        currency: 'ARS',
        dataNote:
          'Ingreso recuperado estimado = restaurantes recuperados × ingreso mensual promedio por cuenta pagada. No es atribución causal v1.',
      },
      careQueue,
      dataGaps: {
        activationRate:
          lcmStats.activationRate === null
            ? 'Derivado de objetivos completados / envíos de ciclo de vida'
            : null,
        retentionRate: 'Proxy: 1 − (cancelaciones 30d / cuentas pagas)',
        ttvMedianDays: 'Pendiente — usar panel de activación del alta en v2',
      },
    };
  }

  async getCampaigns(days = 7) {
    const safeDays = this.clampDays(days);
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    const catalog = listCampaigns();
    const [running, lastSentRows, conversionRows, pausedMap] =
      await Promise.all([
        this.director.getRunningCampaignsSummary(since),
        this.prisma.lifecycleDelivery.groupBy({
          by: ['campaignId'],
          where: { status: { in: ['SENT', 'SIMULATED'] } },
          _max: { sentAt: true, createdAt: true },
        }),
        this.prisma.lifecycleOutcome.groupBy({
          by: ['campaignId'],
          where: {
            recordedAt: { gte: since },
            type: {
              in: ['GOAL_COMPLETED', 'JOURNEY_COMPLETED', 'OPENED', 'CLICKED'],
            },
          },
          _count: { _all: true },
        }),
        this.campaignOverrides.getPausedMap(catalog.map((c) => c.id)),
      ]);

    const lastSentMap = new Map(
      lastSentRows.map((r) => [
        r.campaignId,
        (r._max.sentAt ?? r._max.createdAt)?.toISOString() ?? null,
      ]),
    );
    const conversionMap = new Map(
      conversionRows.map((r) => [r.campaignId, r._count._all]),
    );
    const runningMap = new Map(running.map((r) => [r.campaignId, r]));

    return {
      periodDays: safeDays,
      items: catalog.map((campaign) => {
        const stats = runningMap.get(campaign.id);
        const paused = pausedMap.get(campaign.id) === true;
        const status = paused
          ? ('idle' as const)
          : this.deriveCampaignStatus(
              stats?.activeRestaurants ?? 0,
              stats?.sentThisWeek ?? 0,
            );
        return {
          campaignId: campaign.id,
          campaignType: campaign.type,
          status,
          goal: campaign.goal,
          strategy: campaign.primaryJob ?? campaign.type,
          trigger:
            campaign.entryConditions.requiresRecommendationCodes?.[0] ??
            campaign.entryConditions.requiresOpportunityCodes?.[0] ??
            'Automático por inteligencia',
          segment: (campaign.entryConditions.rssBands ?? ['todos']).join(', '),
          channel: campaign.recommendedChannel,
          restaurantsCount: stats?.activeRestaurants ?? 0,
          sentThisPeriod: stats?.sentThisWeek ?? 0,
          openRate: stats?.openRate ?? 0,
          conversions: conversionMap.get(campaign.id) ?? 0,
          impactNote: paused
            ? 'Pausada desde Comunicación'
            : stats?.activeRestaurants
              ? `${stats.activeRestaurants} instancias activas`
              : 'Sin instancias activas',
          lastExecutionAt: lastSentMap.get(campaign.id) ?? null,
          enabled: !paused,
          actions: {
            canPause: !paused,
            canActivate: paused,
            canDuplicate: true,
            dataNote: paused
              ? 'Pausada — no se evalúa ni envía hasta reactivar'
              : 'Activar o pausar controla qué campañas corren',
          },
        };
      }),
    };
  }

  async setCampaignPaused(
    campaignId: string,
    paused: boolean,
    updatedBy?: string,
  ) {
    return this.campaignOverrides.setPaused(campaignId, paused, updatedBy);
  }

  async getCareQueue(limit = 12) {
    return this.segments.getCareQueue(limit);
  }

  async getCampaignPerformance(campaignId: string, days = 7) {
    return this.director.getCampaignPerformance(
      campaignId,
      this.clampDays(days),
    );
  }

  async getTemplates() {
    const lcm = listLcmTemplates();
    const ceRaw = listCeTemplates();
    const ce = ceRaw;

    const lcmItems = await Promise.all(
      lcm.map(async (t) => {
        const effective = await this.templateOverrides.getEffectiveTemplate(
          t.id,
        );
        return {
          id: t.id,
          source: 'lifecycle' as const,
          group: this.resolveTemplateGroup({
            types: t.campaignTypes,
            trigger: t.id,
          }),
          subject: effective?.subject ?? t.subject ?? null,
          preview: effective?.preview ?? t.preview ?? null,
          body: effective?.body ?? t.body,
          variables: effective?.variables ?? t.variables,
          cta: effective?.cta ?? t.cta ?? null,
          version: effective?.version ?? t.version,
          channel: t.channel,
          hasOverride: effective?.hasOverride ?? false,
          updatedAt: effective?.updatedAt ?? null,
          updatedBy: effective?.updatedBy ?? null,
          historyNote:
            'Historial de versiones completo pendiente — solo override actual en DB',
        };
      }),
    );

    const ceItems = ce.map(
      (t: {
        id: string;
        subject?: string | null;
        body: string;
        variables?: string[];
        cta?: string | null;
        version?: string;
        trigger?: string;
        supportedChannels?: string[];
      }) => ({
        id: t.id,
        source: 'engagement' as const,
        group: this.resolveTemplateGroup({
          types: [],
          trigger: t.trigger ?? t.id,
        }),
        subject: t.subject ?? null,
        preview: null,
        body: t.body,
        variables: t.variables ?? [],
        cta: t.cta ?? null,
        version: t.version ?? '1.0.0',
        channel: t.supportedChannels?.[0] ?? 'email',
        hasOverride: false,
        updatedAt: null,
        updatedBy: null,
        historyNote:
          'Plantillas de seguimiento: catálogo base v1 — personalización completa en v2',
      }),
    );

    const groups = [...new Set([...lcmItems, ...ceItems].map((i) => i.group))];

    return {
      groups,
      items: [...lcmItems, ...ceItems],
      total: lcmItems.length + ceItems.length,
    };
  }

  async getTemplate(templateId: string) {
    const hub = await this.getTemplates();
    const found = hub.items.find((t) => t.id === templateId);
    if (found) return found;
    const effective =
      await this.templateOverrides.getEffectiveTemplate(templateId);
    if (!effective) return null;
    return {
      id: effective.id,
      source: 'lifecycle' as const,
      group: this.resolveTemplateGroup({
        types: effective.campaignTypes,
        trigger: effective.id,
      }),
      subject: effective.subject ?? null,
      preview: effective.preview ?? null,
      body: effective.body,
      variables: effective.variables,
      cta: effective.cta ?? null,
      version: effective.version,
      channel: effective.channel,
      hasOverride: effective.hasOverride,
      updatedAt: effective.updatedAt,
      updatedBy: effective.updatedBy,
      historyNote: null,
    };
  }

  async getJourneys(days = 7) {
    const safeDays = this.clampDays(days);
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    const catalog = listJourneys();
    const journeyList = catalog;

    const [activeByJourney, completedByJourney, deliveriesByCampaign] =
      await Promise.all([
        this.prisma.engagementActiveJourney.groupBy({
          by: ['journeyId'],
          where: { status: 'ACTIVE' },
          _count: { _all: true },
        }),
        this.prisma.engagementActiveJourney.groupBy({
          by: ['journeyId'],
          where: {
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
          _count: { _all: true },
        }),
        this.prisma.lifecycleDelivery.groupBy({
          by: ['campaignId'],
          where: {
            createdAt: { gte: since },
            status: { in: ['SENT', 'SIMULATED'] },
          },
          _count: { _all: true },
        }),
      ]);

    const activeMap = new Map(
      activeByJourney.map((r) => [r.journeyId, r._count._all]),
    );
    const completedMap = new Map(
      completedByJourney.map((r) => [r.journeyId, r._count._all]),
    );
    const sentMap = new Map(
      deliveriesByCampaign.map((r) => [r.campaignId, r._count._all]),
    );

    const onboardingFlow = ONBOARDING_FLOW.map((step, index) => {
      const sent = sentMap.get(step.id) ?? 0;
      const nextSent = sentMap.get(ONBOARDING_FLOW[index + 1]?.id ?? '') ?? 0;
      const conversionRate =
        sent > 0 && ONBOARDING_FLOW[index + 1] ? nextSent / sent : null;
      return {
        ...step,
        sentThisPeriod: sent,
        conversionToNext: conversionRate,
        avgDaysBetweenSteps: null as number | null,
        dataNote:
          'Tiempo promedio entre pasos pendiente — requiere estadísticas de cohorte v2',
      };
    });

    return {
      periodDays: safeDays,
      canonicalFlow: onboardingFlow,
      catalog: journeyList.map(
        (j: {
          id: string;
          name: string;
          objective: string;
          journeyType: string;
          steps: Array<{
            stepId: string;
            goal: string;
            channel: string;
            delayDays: number;
          }>;
        }) => ({
          journeyId: j.id,
          name: j.name,
          objective: j.objective,
          journeyType: j.journeyType,
          steps: j.steps,
          activeRestaurants: activeMap.get(j.id) ?? 0,
          completedThisPeriod: completedMap.get(j.id) ?? 0,
          abandonNote:
            'Abandonos: seguimiento de recorridos cancelados disponible en datos; se suma a la UI en v2',
        }),
      ),
    };
  }

  getDeliveries(query: MarketingDeliveriesQuery) {
    return this.deliveriesQuery.listDeliveries(query);
  }

  async getAnalytics(days = 7) {
    const safeDays = this.clampDays(days);
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    const [lcm, ce, winback, segments, billing, outcomes] = await Promise.all([
      this.lifecycle.getDashboardStats(safeDays),
      this.engagement.getDashboardStats(safeDays),
      this.director.getCampaignPerformance(WINBACK_CAMPAIGN_ID, safeDays),
      this.segments.getRestaurantSegments(),
      this.getBillingSnapshot(),
      this.prisma.lifecycleOutcome.groupBy({
        by: ['type'],
        where: { recordedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const ceOpened =
      ce.outcomesByType.find((o) => o.type === 'OPENED')?.count ?? 0;
    const ceClicked =
      ce.outcomesByType.find((o) => o.type === 'CLICKED')?.count ?? 0;
    const ceReplied =
      ce.outcomesByType.find((o) => o.type === 'REPLIED')?.count ?? 0;

    const totalSent = lcm.sent + ce.deliveriesSent;
    const totalOpened =
      lcm.opened +
      ceOpened +
      (outcomes.find((o) => o.type === 'OPENED')?._count._all ?? 0);
    const totalClicked = lcm.clicked + ceClicked;

    return {
      periodDays: safeDays,
      activation: {
        rate: this.computeActivationRate(lcm, ce),
        goalCompleted: lcm.goalCompleted,
        activeJourneys: ce.activeJourneys,
      },
      retention: {
        rate: await this.computeRetentionRate(),
        championCount: segments.championRestaurants,
      },
      recovery: {
        rate: winback.recoveryRate,
        recovered: winback.recovered,
        sent: winback.sent,
      },
      expansion: {
        upsellSent: await this.prisma.lifecycleDelivery.count({
          where: {
            campaignId: 'LCM-UPSELL-01',
            createdAt: { gte: since },
            status: { in: ['SENT', 'SIMULATED'] },
          },
        }),
        dataNote:
          'Expansión atribuida a campaña de mejora de plan — ver números por campaña',
      },
      champion: {
        count: segments.championRestaurants,
        healthyCount: segments.healthyRestaurants,
      },
      churn: {
        atRiskCount: segments.atRiskRestaurants,
        canceledLast30d: billing.canceledLast30d,
      },
      engagement: {
        openRate: totalSent > 0 ? totalOpened / totalSent : 0,
        clickRate: totalSent > 0 ? totalClicked / totalSent : 0,
        replyRate: totalSent > 0 ? ceReplied / totalSent : 0,
        journeyCompletionRate: lcm.journeyCompletionRate,
      },
      mrr: {
        estimatedTotal: billing.estimatedMrr / 100,
        estimatedRecovered:
          ((await this.countRecoveredRestaurants(since)) *
            (billing.paidAccounts > 0
              ? billing.estimatedMrr / billing.paidAccounts
              : 0)) /
          100,
      },
      rssImpact: {
        positiveOutcomes: outcomes
          .filter(
            (o) => o.type === 'RSS_CONTRIBUTION' || o.type === 'GOAL_COMPLETED',
          )
          .reduce((sum, o) => sum + o._count._all, 0),
        dataNote:
          'Impacto en salud sumado desde resultados del ciclo de vida — no recalcula la puntuación',
      },
      trend: winback.trend,
    };
  }

  async getRestaurantView(ref: string) {
    const restaurantId = await this.restaurantRef.resolveRestaurantId(ref);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });
    if (!restaurant) return null;

    const [
      bundle,
      lcmDeliveries,
      ceDeliveries,
      lcmOutcomes,
      ceOutcomes,
      activeLcmRows,
      ceJourneys,
      lcmPlan,
      cePlan,
    ] = await Promise.all([
      this.orchestrator.getSnapshot(restaurantId),
      this.lifecycle.listDeliveries(restaurantId),
      this.engagement.listDeliveries(restaurantId),
      this.lifecycle.listOutcomes(restaurantId),
      this.engagement.listOutcomes(restaurantId),
      this.prisma.lifecycleActiveCampaign.findMany({
        where: { restaurantId, status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
      }),
      this.engagement.listActiveJourneys(restaurantId),
      this.lifecycle.planForRestaurant(restaurantId, { dryRun: true }),
      this.engagement.planForRestaurant(restaurantId, { dryRun: true }),
    ]);

    const timeline = [
      ...lcmDeliveries.map((d) => ({
        at: d.sentAt ?? d.deliverAt,
        kind: 'delivery' as const,
        source: 'lifecycle' as const,
        title: d.subject ?? d.bodyPreview,
        meta: `${d.campaignType} · ${d.channel} · ${d.status}`,
      })),
      ...ceDeliveries.map((d) => ({
        at: d.sentAt ?? d.deliverAt,
        kind: 'delivery' as const,
        source: 'engagement' as const,
        title: d.subject ?? d.bodyPreview,
        meta: `${d.recommendationCode} · ${d.channel} · ${d.status}`,
      })),
      ...lcmOutcomes.map((o) => ({
        at: o.recordedAt,
        kind: 'outcome' as const,
        source: 'lifecycle' as const,
        title: o.type,
        meta: o.campaignType,
      })),
      ...ceOutcomes.map((o) => ({
        at: o.recordedAt,
        kind: 'outcome' as const,
        source: 'engagement' as const,
        title: o.type,
        meta: o.recommendationCode,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      restaurant,
      intelligence: bundle
        ? {
            status: bundle.status,
            rss: bundle.snapshot?.rss.value ?? null,
            rssBand: bundle.snapshot?.rss.band ?? null,
            topRecommendation: bundle.recommendations[0]?.title ?? null,
          }
        : null,
      activeCampaigns: {
        lifecycle: activeLcmRows.map((row) => ({
          campaignId: row.campaignId,
          campaignType: row.campaignType,
          currentStepIndex: row.currentStepIndex,
          startedAt: row.startedAt.toISOString(),
          lastTouchAt: row.lastTouchAt?.toISOString() ?? null,
          sourceRecommendationCode: row.sourceRecommendationCode,
          sourceOpportunityCode: row.sourceOpportunityCode,
        })),
        types: activeLcmRows.map((row) => row.campaignType),
      },
      activeJourneys: ceJourneys.map((j) => ({
        journeyId: j.journeyId,
        journeyType: j.journeyType,
        currentStepIndex: j.currentStepIndex,
        startedAt: j.startedAt.toISOString(),
        lastTouchAt: j.lastTouchAt?.toISOString() ?? null,
        sourceRecommendationCode: j.sourceRecommendationCode,
      })),
      upcoming: {
        lifecycle: lcmPlan.scheduledDeliveries.slice(0, 5).map((d) => ({
          campaignId: d.campaignId,
          campaignType: d.campaignType,
          channel: d.channel,
          deliverAt: d.deliverAt,
          subject: d.subject,
          bodyPreview: d.bodyPreview,
        })),
        engagement: cePlan.scheduledDeliveries.slice(0, 5).map((d) => ({
          recommendationCode: d.recommendationCode,
          channel: d.channel,
          deliverAt: d.deliverAt,
          subject: d.subject,
          bodyPreview: d.bodyPreview,
        })),
      },
      deliveries: {
        lifecycle: lcmDeliveries.slice(0, 30).map((d) => ({
          id: d.id,
          campaignId: d.campaignId,
          campaignType: d.campaignType,
          channel: d.channel,
          status: d.status,
          subject: d.subject,
          bodyPreview: d.bodyPreview,
          sentAt: this.toIso(d.sentAt),
          deliverAt: this.toIso(d.deliverAt) ?? '',
        })),
        engagement: ceDeliveries.slice(0, 30).map((d) => ({
          id: d.id,
          recommendationCode: d.recommendationCode,
          channel: d.channel,
          status: d.status,
          subject: d.subject,
          bodyPreview: d.bodyPreview,
          sentAt: this.toIso(d.sentAt),
          deliverAt: this.toIso(d.deliverAt) ?? '',
        })),
      },
      outcomes: {
        lifecycle: lcmOutcomes.slice(0, 30).map((o) => ({
          id: o.id,
          type: o.type,
          campaignType: o.campaignType,
          recordedAt: this.toIso(o.recordedAt) ?? '',
          rssDelta: o.rssDelta,
        })),
        engagement: ceOutcomes.slice(0, 30).map((o) => ({
          id: o.id,
          type: o.type,
          recommendationCode: o.recommendationCode,
          recordedAt: this.toIso(o.recordedAt) ?? '',
        })),
      },
      plans: {
        lifecycle: {
          scheduled: lcmPlan.scheduledDeliveries.length,
          skipped: lcmPlan.skipped.length,
          bundleStatus: lcmPlan.bundleStatus,
        },
        engagement: {
          scheduled: cePlan.scheduledDeliveries.length,
          skipped: cePlan.skipped.length,
          bundleStatus: cePlan.bundleStatus,
        },
      },
      timeline: timeline.slice(0, 60),
    };
  }

  private clampDays(days: number) {
    return Number.isFinite(days) && days > 0 && days <= 90 ? days : 7;
  }

  private deriveCampaignStatus(
    activeRestaurants: number,
    sentThisWeek: number,
  ) {
    if (activeRestaurants > 0) return 'running';
    if (sentThisWeek > 0) return 'recent';
    return 'idle';
  }

  private resolveTemplateGroup(ctx: TemplateGroupCtx) {
    for (const rule of TEMPLATE_GROUP_RULES) {
      if (rule.group === 'Educación') continue;
      if (rule.match(ctx)) return rule.group;
    }
    return 'Educación';
  }

  private async getBillingSnapshot() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { isBillingAnchor: true },
      select: {
        planType: true,
        status: true,
        canceledAt: true,
      },
    });

    let estimatedMrr = 0;
    let paidAccounts = 0;
    let canceledLast30d = 0;
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const sub of subscriptions) {
      const price = this.planPrices[sub.planType || 'STARTER'] ?? 0;
      const isActive =
        sub.status === SubscriptionStatus.ACTIVE ||
        sub.status === SubscriptionStatus.TRIALING;
      if (isActive && price > 0) {
        estimatedMrr += price;
        paidAccounts += 1;
      }
      if (sub.canceledAt && sub.canceledAt >= last30d) canceledLast30d += 1;
    }

    return { estimatedMrr, paidAccounts, canceledLast30d };
  }

  private async countRecoveredRestaurants(since: Date) {
    const rows = await this.prisma.lifecycleOutcome.findMany({
      where: {
        recordedAt: { gte: since },
        OR: [
          { type: 'GOAL_COMPLETED' },
          { type: 'JOURNEY_COMPLETED' },
          { type: 'RSS_CONTRIBUTION', rssDelta: { gt: 0 } },
        ],
      },
      select: { restaurantId: true },
    });
    return new Set(rows.map((r) => r.restaurantId)).size;
  }

  private computeActivationRate(
    lcm: Awaited<ReturnType<LifecycleMarketingService['getDashboardStats']>>,
    ce: Awaited<ReturnType<EngagementEngineService['getDashboardStats']>>,
  ) {
    if (lcm.activationRate != null) return lcm.activationRate;
    const sent = lcm.sent + ce.deliveriesSent;
    if (sent === 0) return 0;
    return lcm.goalCompleted / sent;
  }

  private async computeRetentionRate() {
    const billing = await this.getBillingSnapshot();
    if (billing.paidAccounts === 0) return 0;
    return Math.max(
      0,
      1 - billing.canceledLast30d / Math.max(billing.paidAccounts, 1),
    );
  }

  private async computeReferralRate(since: Date) {
    const sent = await this.prisma.lifecycleDelivery.count({
      where: {
        campaignId: 'LCM-REFERRAL-01',
        createdAt: { gte: since },
        status: { in: ['SENT', 'SIMULATED'] },
      },
    });
    const goals = await this.prisma.lifecycleOutcome.count({
      where: {
        campaignId: 'LCM-REFERRAL-01',
        recordedAt: { gte: since },
        type: 'GOAL_COMPLETED',
      },
    });
    return sent > 0 ? goals / sent : 0;
  }

  private mergeRates(
    lcmOpen: number,
    ce: Awaited<ReturnType<EngagementEngineService['getDashboardStats']>>,
  ) {
    const ceOpened =
      ce.outcomesByType.find((o) => o.type === 'OPENED')?.count ?? 0;
    const totalSent = ce.deliveriesSent;
    if (totalSent === 0) return lcmOpen;
    return (lcmOpen + ceOpened / Math.max(totalSent, 1)) / 2;
  }

  private toIso(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
