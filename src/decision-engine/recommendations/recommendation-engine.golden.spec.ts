import { RecommendationEngineService } from './recommendation-engine.service';
import { RecommendationRegistry } from './recommendation-registry.service';
import { OpportunityEngineService } from '../opportunities/opportunity-engine.service';
import { OpportunityRegistry } from '../opportunities/opportunity-registry.service';
import {
  RssAggregatorService,
  RssEngineService,
} from '../rss/rss-engine.service';
import { DimensionRegistry } from '../rss/dimension-registry.service';
import { SignalCode } from '../signals/catalog/signal-catalog.loader';
import { SignalEngineService } from '../signals/signal-engine.service';
import { SignalRegistry } from '../signals/signal-registry.service';
import {
  DecisionDomainEventType,
  normalizeDomainEvent,
} from '../signals/types/domain-event.types';
import {
  DEFAULT_MODEL_VERSION,
  type EvaluationContext,
} from '../signals/types/evaluation-context.types';
import type { ProducedSignal } from '../signals/types/signal.types';
import type { RssEngineContext } from '../rss/types/restaurant-success-snapshot.types';
import { getSignalCatalogEntry } from '../signals/catalog/signal-catalog.loader';
import { RecommendationCode } from './catalog/recommendation-catalog.loader';
import { RecommendationStrategy } from './catalog/strategy-catalog.loader';
import { OpportunityCode } from '../opportunities/catalog/opportunity-catalog.loader';
import type { DetectedOpportunity } from '../opportunities/types/opportunity.types';
import type { ActiveRecommendationRecord } from './types/recommendation.types';

function createPipeline() {
  const signalRegistry = new SignalRegistry();
  signalRegistry.onModuleInit();
  const dimensionRegistry = new DimensionRegistry();
  dimensionRegistry.onModuleInit();
  const rss = new RssEngineService(new RssAggregatorService(dimensionRegistry));
  const opportunityRegistry = new OpportunityRegistry();
  opportunityRegistry.onModuleInit();
  const recommendationRegistry = new RecommendationRegistry();
  recommendationRegistry.onModuleInit();
  return {
    signals: new SignalEngineService(signalRegistry),
    rss,
    opportunities: new OpportunityEngineService(opportunityRegistry),
    recommendations: new RecommendationEngineService(recommendationRegistry),
  };
}

function mockSignal(restaurantId: string, code: string): ProducedSignal {
  const entry = getSignalCatalogEntry(code as never);
  return {
    id: `${restaurantId}:${code}`,
    code,
    category: entry.category,
    severity: entry.importance,
    direction: entry.direction,
    restaurantId,
    status: 'active',
    detectedAt: new Date('2026-03-20T12:00:00.000Z'),
    sourceEventIds: [],
    explanation: entry.explanationTemplate,
    metadata: {},
    ruleVersion: '1.0.0',
    ruleId: `RULE-${code}`,
    primaryJob: entry.primaryJob,
    dimension: entry.dimension,
  };
}

function rssContext(
  restaurantId: string,
  overrides: Partial<RssEngineContext> = {},
): RssEngineContext {
  return {
    restaurantId,
    evaluatedAt: new Date('2026-03-20T12:00:00.000Z'),
    intent: 'digital',
    tenureDays: 20,
    modelVersion: DEFAULT_MODEL_VERSION,
    ...overrides,
  };
}

function evalContext(
  restaurantId: string,
  overrides: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    restaurantId,
    evaluatedAt: new Date('2026-03-20T12:00:00.000Z'),
    intent: 'digital',
    tenureDays: 20,
    modelVersion: DEFAULT_MODEL_VERSION,
    ruleCatalogVersion: '1.0.0',
    ...overrides,
  };
}

function runFullPipeline(
  pipeline: ReturnType<typeof createPipeline>,
  restaurantId: string,
  activeSignals: ProducedSignal[],
  rssOverrides: Partial<RssEngineContext> = {},
  activeRecommendations: ActiveRecommendationRecord[] = [],
) {
  const { snapshot } = pipeline.rss.evaluate({
    signals: activeSignals,
    context: rssContext(restaurantId, rssOverrides),
  });
  const oppOutput = pipeline.opportunities.evaluate({ snapshot });
  const recOutput = pipeline.recommendations.evaluate({
    opportunities: oppOutput.opportunities,
    snapshot,
    activeRecommendations,
  });
  return { snapshot, oppOutput, recOutput };
}

describe('RecommendationEngineService golden', () => {
  const pipeline = createPipeline();

  it('Assist: REC-PUB-01 desde OPP-CFG-01', () => {
    const restaurantId = 'rest-rec-pub';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_PUB_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.ASSIST);
    expect(rec!.signalIds.length).toBeGreaterThanOrEqual(1);
    expect(rec!.opportunityIds.length).toBe(1);
    expect(rec!.explanation).toContain('OPP-CFG-01');
    expect(rec!.explanation).toContain('Estrategia Assist');
  });

  it('Recover: REC-SAV-01 critical desde OPP-RSK-03', () => {
    const restaurantId = 'rest-rec-sav';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_SAV_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.RECOVER);
    expect(rec!.priority).toBe('critical');
    expect(rec!.consumerHints.taskType).toBe('save_call');
    expect(rec!.explanation).toContain('INV-16');
  });

  it('Expand: REC-GRW-01 desde OPP-EXP-04', () => {
    const restaurantId = 'rest-rec-grw';
    const { recOutput } = runFullPipeline(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
        mockSignal(restaurantId, SignalCode.SIG_CFG_05),
        mockSignal(restaurantId, SignalCode.SIG_CFG_08),
        mockSignal(restaurantId, SignalCode.SIG_OPS_02),
        mockSignal(restaurantId, SignalCode.SIG_OPS_07),
        mockSignal(restaurantId, SignalCode.SIG_BIZ_01),
      ],
      { tenureDays: 60 },
    );

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_GRW_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.EXPAND);
    expect(rec!.priority).toBe('low');
  });

  it('Celebrate: REC-CEL-01 desde OPP-EXP-06', () => {
    const restaurantId = 'rest-rec-cel';
    const { recOutput } = runFullPipeline(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_OPS_02),
      ],
      { tenureDays: 8 },
    );

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_CEL_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.CELEBRATE);
    expect(rec!.explanation).toContain('milestone');
  });

  it('Educate: REC-GOL-01 desde OPP-CFG-04', () => {
    const restaurantId = 'rest-rec-gol';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_09),
    ]);

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_GOL_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.EDUCATE);
  });

  it('Warn: REC-TRI-01 desde OPP-RSK-05 con trialDay', () => {
    const restaurantId = 'rest-rec-tri';
    const { snapshot } = pipeline.rss.evaluate({
      signals: [mockSignal(restaurantId, SignalCode.SIG_RSK_08)],
      context: rssContext(restaurantId),
    });
    const oppOutput = pipeline.opportunities.evaluate({
      snapshot,
      context: { trialDay: 12 },
    });
    const recOutput = pipeline.recommendations.evaluate({
      opportunities: oppOutput.opportunities,
      snapshot,
    });

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_TRI_01,
    );
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.WARN);
    expect(rec!.priority).toBe('high');
  });

  it('Validate: REC-TST-01 desde OPP-OPS-02', () => {
    const restaurantId = 'rest-rec-tst';
    const { oppOutput, recOutput } = runFullPipeline(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
        mockSignal(restaurantId, SignalCode.SIG_CFG_05),
        mockSignal(restaurantId, SignalCode.SIG_OPS_09),
      ],
      { tenureDays: 20 },
    );

    expect(
      oppOutput.opportunities.some(
        (o) => o.code === OpportunityCode.OPP_OPS_02,
      ),
    ).toBe(true);

    const allRecs = [...recOutput.recommendations, ...recOutput.backlog];
    const rec = allRecs.find((r) => r.code === RecommendationCode.REC_TST_01);
    expect(rec).toBeDefined();
    expect(rec!.strategy).toBe(RecommendationStrategy.VALIDATE);
  });

  it('INV-18: nunca más de 3 recomendaciones activas', () => {
    const restaurantId = 'rest-max3';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_OPS_09),
    ]);

    expect(recOutput.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('INV-05: toda REC emitida tiene signalIds >= 1', () => {
    const restaurantId = 'rest-inv05';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    for (const rec of recOutput.recommendations) {
      expect(rec.signalIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('priorización: REC-SAV-01 critical antes que REC-PUB-01', () => {
    const restaurantId = 'rest-priority';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    expect(recOutput.recommendations[0].code).toBe(
      RecommendationCode.REC_SAV_01,
    );
    expect(recOutput.recommendations[0].priority).toBe('critical');
  });

  it('confidence separada de priority', () => {
    const restaurantId = 'rest-conf';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);

    const rec = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_PUB_01,
    );
    expect(rec!.confidence).toBeDefined();
    expect(rec!.priority).toBeDefined();
    expect(rec!.explanation).toContain('Confianza');
    expect(rec!.explanation).toContain('Prioridad');
  });

  it('explicabilidad completa en cada Recommendation', () => {
    const restaurantId = 'rest-explain';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);

    const rec = recOutput.recommendations[0];
    expect(rec.explanation).toContain('¿Por qué se recomienda?');
    expect(rec.explanation).toContain('Opportunity');
    expect(rec.explanation).toContain('resultado espera Bentoo');
    expect(rec.explanation).toContain('Estrategia');
    expect(rec.rssDimensions.length).toBeGreaterThan(0);
    expect(rec.estimatedImpact.outcome).toBeTruthy();
    expect(rec.estimatedEffort).toMatch(/^(minutes|hours|project)$/);
  });

  it('DecisionExplanation incluye trace con principles en Critical', () => {
    const restaurantId = 'rest-expl-critical';
    const { recOutput } = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    expect(recOutput.explanation.trace.principles).toEqual(
      expect.arrayContaining(['INV-16', 'P25']),
    );
    expect(recOutput.explanation.whatToDo.primaryRecommendationCode).toBe(
      RecommendationCode.REC_SAV_01,
    );
  });

  it('es determinístico', () => {
    const restaurantId = 'rest-rec-det';
    const signals = [mockSignal(restaurantId, SignalCode.SIG_CFG_03)];
    const a = runFullPipeline(pipeline, restaurantId, signals);
    const b = runFullPipeline(pipeline, restaurantId, signals);

    expect(a.recOutput.recommendations.map((r) => r.code)).toEqual(
      b.recOutput.recommendations.map((r) => r.code),
    );
  });

  it('idempotente: no duplica REC activa', () => {
    const restaurantId = 'rest-rec-idem';
    const first = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    const second = runFullPipeline(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      {},
      first.recOutput.activeRecommendations,
    );

    expect(
      second.recOutput.recommendations.filter(
        (r) => r.code === RecommendationCode.REC_PUB_01,
      ),
    ).toHaveLength(1);
    const pubRun = second.recOutput.decisionLog.runs.find(
      (r) => r.recommendationCode === RecommendationCode.REC_PUB_01,
    );
    expect(pubRun?.discarded).toBe(true);
  });

  it('Champion bloquea REC-PUB-01 salvo regresión SIG-RSK-02', () => {
    const restaurantId = 'rest-champion';
    const healthy = runFullPipeline(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
        mockSignal(restaurantId, SignalCode.SIG_CFG_05),
        mockSignal(restaurantId, SignalCode.SIG_CFG_08),
        mockSignal(restaurantId, SignalCode.SIG_OPS_02),
        mockSignal(restaurantId, SignalCode.SIG_OPS_07),
        mockSignal(restaurantId, SignalCode.SIG_BIZ_01),
      ],
      { tenureDays: 90 },
    );
    expect(healthy.snapshot.rss.band).toBe('champion');

    const oppWithGap = pipeline.opportunities.evaluate({
      snapshot: {
        ...healthy.snapshot,
        signalsConsidered: [
          ...healthy.snapshot.signalsConsidered.filter(
            (c) => c !== SignalCode.SIG_CFG_01,
          ),
          SignalCode.SIG_CFG_03,
        ],
      },
    });

    const blocked = pipeline.recommendations.evaluate({
      opportunities: [
        ...oppWithGap.toOpen,
        {
          id: `${restaurantId}:${OpportunityCode.OPP_CFG_01}`,
          code: OpportunityCode.OPP_CFG_01,
          category: 'gap',
          priority: 'high',
          confidence: 'high',
          title: 'test',
          description: 'test',
          explanation: 'test',
          signalIds: [`${restaurantId}:${SignalCode.SIG_CFG_03}`],
          rssDimensions: ['configuration'],
          supportingSignals: [SignalCode.SIG_CFG_03, 'absent:SIG-CFG-01'],
          expectedOutcome: 'test',
          recommendedActionType: 'publish_channel',
          primaryJob: 'test',
          createdAt: new Date().toISOString(),
          ruleVersion: '1.0.0',
          ruleId: 'RULE-OPP-CFG-01',
        } satisfies DetectedOpportunity,
      ],
      snapshot: healthy.snapshot,
    });

    expect(
      blocked.recommendations.some(
        (r) => r.code === RecommendationCode.REC_PUB_01,
      ),
    ).toBe(false);
  });

  it('superseded cuando oportunidad origen desaparece', () => {
    const restaurantId = 'rest-supersede';
    const first = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    expect(first.recOutput.activeRecommendations.length).toBeGreaterThan(0);

    const second = pipeline.recommendations.evaluate({
      opportunities: [],
      snapshot: first.snapshot,
      activeRecommendations: first.recOutput.activeRecommendations,
    });

    expect(second.superseded.length).toBeGreaterThan(0);
  });

  it('suppression flag en context bloquea REC', () => {
    const restaurantId = 'rest-suppress';
    const { snapshot } = pipeline.rss.evaluate({
      signals: [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      context: rssContext(restaurantId),
    });
    const opps = pipeline.opportunities.evaluate({ snapshot });
    const output = pipeline.recommendations.evaluate({
      opportunities: opps.toOpen,
      snapshot,
      context: { activeSuppressions: [RecommendationCode.REC_PUB_01] },
    });

    expect(
      output.recommendations.some(
        (r) => r.code === RecommendationCode.REC_PUB_01,
      ),
    ).toBe(false);
  });

  it('La Parrilla: REC-PUB-01 + REC-CHK-01 high, ≤3 total', () => {
    const restaurantId = 'rest-la-parrilla-norte';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.MenuReady,
        payload: {},
        occurredAt: '2026-03-05T10:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-2',
        restaurantId,
        type: DecisionDomainEventType.PaymentsOnlineConnected,
        payload: {},
        occurredAt: '2026-03-08T10:00:00.000Z',
        source: 'test',
      }),
    ];

    const signalOutput = pipeline.signals.evaluateFromEvents(
      events,
      evalContext(restaurantId, { tenureDays: 20 }),
    );
    const { snapshot } = pipeline.rss.evaluate({
      signals: signalOutput.signals,
      context: rssContext(restaurantId, { tenureDays: 20 }),
    });
    const oppOutput = pipeline.opportunities.evaluate({ snapshot });
    const recOutput = pipeline.recommendations.evaluate({
      opportunities: oppOutput.opportunities,
      snapshot,
    });

    expect(recOutput.recommendations.length).toBeLessThanOrEqual(3);

    const pub = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_PUB_01,
    );
    const chk = recOutput.recommendations.find(
      (r) => r.code === RecommendationCode.REC_CHK_01,
    );

    expect(pub).toBeDefined();
    expect(chk).toBeDefined();
    expect(pub!.priority).toBe('high');
    expect(chk!.priority).toBe('high');

    const pubIdx = recOutput.recommendations.indexOf(pub!);
    const chkIdx = recOutput.recommendations.indexOf(chk!);
    expect(Math.min(pubIdx, chkIdx)).toBeLessThan(2);
  });

  it('DecisionLog registra evaluadores, creadas y descartadas', () => {
    const restaurantId = 'rest-rec-log';
    const first = runFullPipeline(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    const second = runFullPipeline(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      {},
      first.recOutput.activeRecommendations,
    );

    expect(second.recOutput.decisionLog.evaluatorsRun).toBe(14);
    expect(
      second.recOutput.decisionLog.runs.every((r) =>
        r.ruleId.startsWith('RULE-REC'),
      ),
    ).toBe(true);
  });
});

describe('RecommendationRegistry', () => {
  it('registra evaluadores independientes (1 REC cada uno)', () => {
    const registry = new RecommendationRegistry();
    registry.onModuleInit();
    expect(registry.getEvaluatorCount()).toBe(14);
    const codes = registry.getEvaluators().map((e) => e.recommendationCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
