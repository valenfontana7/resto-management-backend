import { OpportunityEngineService } from './opportunity-engine.service';
import { OpportunityRegistry } from './opportunity-registry.service';
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
import { OpportunityCode } from './catalog/opportunity-catalog.loader';

function createPipeline(): {
  signals: SignalEngineService;
  rss: RssEngineService;
  opportunities: OpportunityEngineService;
} {
  const signalRegistry = new SignalRegistry();
  signalRegistry.onModuleInit();
  const dimensionRegistry = new DimensionRegistry();
  dimensionRegistry.onModuleInit();
  const rss = new RssEngineService(new RssAggregatorService(dimensionRegistry));
  const opportunityRegistry = new OpportunityRegistry();
  opportunityRegistry.onModuleInit();
  return {
    signals: new SignalEngineService(signalRegistry),
    rss,
    opportunities: new OpportunityEngineService(opportunityRegistry),
  };
}

function mockSignal(
  restaurantId: string,
  code: string,
  detectedAt = new Date('2026-03-20T12:00:00.000Z'),
): ProducedSignal {
  const entry = getSignalCatalogEntry(code as never);
  return {
    id: `${restaurantId}:${code}`,
    code,
    category: entry.category,
    severity: entry.importance,
    direction: entry.direction,
    restaurantId,
    status: 'active',
    detectedAt,
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

function evaluateOpportunitiesFromSignals(
  pipeline: ReturnType<typeof createPipeline>,
  restaurantId: string,
  activeSignals: ProducedSignal[],
  rssOverrides: Partial<RssEngineContext> = {},
  oppContext: { trialDay?: number | null } = {},
  openOpportunities: import('./types/opportunity.types').OpenOpportunityRecord[] = [],
) {
  const { snapshot } = pipeline.rss.evaluate({
    signals: activeSignals,
    context: rssContext(restaurantId, rssOverrides),
  });
  return pipeline.opportunities.evaluate({
    snapshot,
    context: oppContext,
    openOpportunities,
  });
}

describe('OpportunityEngineService golden', () => {
  const pipeline = createPipeline();

  it('Gap OPP-CFG-01: carta OK + sitio no publicado', () => {
    const restaurantId = 'rest-gap-cfg01';
    const output = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);

    const opp = output.toOpen.find(
      (o) => o.code === OpportunityCode.OPP_CFG_01,
    );
    expect(opp).toBeDefined();
    expect(opp!.category).toBe('gap');
    expect(opp!.priority).toBe('high');
    expect(opp!.confidence).toBeDefined();
    expect(opp!.supportingSignals).toEqual(
      expect.arrayContaining(['SIG-CFG-03', 'absent:SIG-CFG-01']),
    );
    expect(opp!.explanation).toContain('SIG-CFG-03');
    expect(opp!.rssDimensions).toContain('configuration');
    expect(opp!.primaryJob).toBeTruthy();
    expect(opp!.expectedOutcome).toBeTruthy();
    expect(opp!.recommendedActionType).toBe('publish_channel');
  });

  it('Risk OPP-RSK-03: cancelación → priority critical', () => {
    const restaurantId = 'rest-risk-cancel';
    const output = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    const opp = output.toOpen.find(
      (o) => o.code === OpportunityCode.OPP_RSK_03,
    );
    expect(opp).toBeDefined();
    expect(opp!.category).toBe('risk');
    expect(opp!.priority).toBe('critical');
    expect(opp!.confidence).toBe('high');
    expect(opp!.signalIds).toContain(
      `${restaurantId}:${SignalCode.SIG_RSK_03}`,
    );
    expect(opp!.explanation).toContain('cancelación');
  });

  it('Expansion OPP-EXP-04: Healthy + pilares activos', () => {
    const restaurantId = 'rest-expansion';
    const output = evaluateOpportunitiesFromSignals(
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

    const opp = output.toOpen.find(
      (o) => o.code === OpportunityCode.OPP_EXP_04,
    );
    expect(opp).toBeDefined();
    expect(opp!.category).toBe('expansion');
    expect(opp!.priority).toBe('low');
    expect(opp!.explanation).toContain('pilares');
  });

  it('Expansion no abre en band Critical', () => {
    const restaurantId = 'rest-exp-critical';
    const output = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    expect(
      output.toOpen.some((o) => o.code === OpportunityCode.OPP_EXP_04),
    ).toBe(false);
    const expRun = output.decisionLog.runs.find(
      (r) => r.opportunityCode === OpportunityCode.OPP_EXP_04,
    );
    expect(expRun?.detected).toBe(false);
  });

  it('Milestone OPP-EXP-06: primer pedido temprano', () => {
    const restaurantId = 'rest-milestone';
    const output = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
        mockSignal(restaurantId, SignalCode.SIG_OPS_02),
      ],
      { tenureDays: 10 },
    );

    const opp = output.toOpen.find(
      (o) => o.code === OpportunityCode.OPP_EXP_06,
    );
    expect(opp).toBeDefined();
    expect(opp!.category).toBe('milestone');
    expect(opp!.supportingSignals).toContain(SignalCode.SIG_OPS_02);
    expect(opp!.explanation).toContain('primer pedido');
  });

  it('OPP-CFG-01 cierra cuando SIG-CFG-01 activa (resolvedWhen)', () => {
    const restaurantId = 'rest-close-cfg01';
    const first = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    expect(
      first.toOpen.some((o) => o.code === OpportunityCode.OPP_CFG_01),
    ).toBe(true);

    const open = first.openOpportunities;
    const second = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      ],
      {},
      {},
      open,
    );

    expect(
      second.toClose.some((c) => c.code === OpportunityCode.OPP_CFG_01),
    ).toBe(true);
    expect(
      second.openOpportunities.some(
        (o) => o.code === OpportunityCode.OPP_CFG_01,
      ),
    ).toBe(false);
  });

  it('es determinístico', () => {
    const restaurantId = 'rest-opp-det';
    const signals = [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_OPS_09),
    ];
    const a = evaluateOpportunitiesFromSignals(pipeline, restaurantId, signals);
    const b = evaluateOpportunitiesFromSignals(pipeline, restaurantId, signals);

    expect(a.toOpen.map((o) => o.code).sort()).toEqual(
      b.toOpen.map((o) => o.code).sort(),
    );
    expect(a.decisionLog.summary).toBe(b.decisionLog.summary);
  });

  it('idempotente: no duplica OPP-CFG-01 abierta', () => {
    const restaurantId = 'rest-opp-idem';
    const first = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    const second = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      {},
      {},
      first.openOpportunities,
    );

    expect(
      second.toOpen.filter((o) => o.code === OpportunityCode.OPP_CFG_01),
    ).toHaveLength(0);
    const cfgRun = second.decisionLog.runs.find(
      (r) => r.opportunityCode === OpportunityCode.OPP_CFG_01,
    );
    expect(cfgRun?.discarded).toBe(true);
    expect(cfgRun?.discardReason).toContain('equivalente');
  });

  it('priorización: risk critical antes que gap high', () => {
    const restaurantId = 'rest-priority';
    const output = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ]);

    expect(output.opportunities[0].code).toBe(OpportunityCode.OPP_RSK_03);
    expect(output.opportunities[0].priority).toBe('critical');
  });

  it('DecisionLog registra evaluadores, creadas y descartadas', () => {
    const restaurantId = 'rest-log';
    const first = evaluateOpportunitiesFromSignals(pipeline, restaurantId, [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
    ]);
    const second = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      {},
      {},
      first.openOpportunities,
    );

    expect(second.decisionLog.evaluatorsRun).toBeGreaterThan(0);
    expect(
      second.decisionLog.runs.every((r) => r.ruleId.startsWith('RULE-OPP')),
    ).toBe(true);
    expect(second.decisionLog.runs.some((r) => r.discarded)).toBe(true);
  });

  it('La Parrilla Norte: OPP-CFG-01, OPP-RSK-01, OPP-OPS-02', () => {
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

    expect(snapshot.rss.band).toBe('at_risk');

    const output = pipeline.opportunities.evaluate({ snapshot });
    const codes = output.toOpen.map((o) => o.code).sort();

    expect(codes).toEqual(
      expect.arrayContaining([
        OpportunityCode.OPP_CFG_01,
        OpportunityCode.OPP_RSK_01,
        OpportunityCode.OPP_OPS_02,
      ]),
    );

    for (const opp of output.toOpen) {
      expect(opp.explanation.length).toBeGreaterThan(20);
      expect(opp.ruleVersion).toBe('1.0.0');
      expect(opp.confidence).toMatch(/^(high|medium|low)$/);
    }
  });

  it('OPP-RSK-05 requiere trialDay en contexto complementario', () => {
    const restaurantId = 'rest-trial';
    const withoutTrial = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_RSK_08)],
    );
    expect(
      withoutTrial.toOpen.some((o) => o.code === OpportunityCode.OPP_RSK_05),
    ).toBe(false);

    const withTrial = evaluateOpportunitiesFromSignals(
      pipeline,
      restaurantId,
      [mockSignal(restaurantId, SignalCode.SIG_RSK_08)],
      {},
      { trialDay: 12 },
    );
    const opp = withTrial.toOpen.find(
      (o) => o.code === OpportunityCode.OPP_RSK_05,
    );
    expect(opp).toBeDefined();
    expect(opp!.priority).toBe('high');
  });
});

describe('OpportunityRegistry', () => {
  it('registra evaluadores independientes (1 OPP cada uno)', () => {
    const registry = new OpportunityRegistry();
    registry.onModuleInit();
    expect(registry.getEvaluatorCount()).toBe(11);
    const codes = registry.getEvaluators().map((e) => e.opportunityCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
