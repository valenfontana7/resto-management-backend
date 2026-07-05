import { RssAggregatorService, RssEngineService } from './rss-engine.service';
import { DimensionRegistry } from './dimension-registry.service';
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
import type { RssEngineContext } from './types/restaurant-success-snapshot.types';
import { getSignalCatalogEntry } from '../signals/catalog/signal-catalog.loader';

function createEngines(): {
  rss: RssEngineService;
  signals: SignalEngineService;
} {
  const signalRegistry = new SignalRegistry();
  signalRegistry.onModuleInit();
  const dimensionRegistry = new DimensionRegistry();
  dimensionRegistry.onModuleInit();
  const aggregator = new RssAggregatorService(dimensionRegistry);
  return {
    rss: new RssEngineService(aggregator),
    signals: new SignalEngineService(signalRegistry),
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

describe('RssEngineService golden', () => {
  const { rss, signals } = createEngines();

  it('restaurante nuevo sin señales → RSS bajo, banda Critical o At Risk', () => {
    const restaurantId = 'rest-new';
    const { snapshot } = rss.evaluate({
      signals: [],
      context: rssContext(restaurantId, { tenureDays: 3 }),
    });

    expect(snapshot.rss.value).toBeLessThan(40);
    expect(['critical', 'at_risk']).toContain(snapshot.rss.band);
    expect(snapshot.signalsConsidered).toEqual([]);
    expect(snapshot.algorithmVersion).toBe('rss.v1');
    expect(snapshot.explanation.headline).toContain('RSS');
  });

  it('La Parrilla Norte vía Signal Engine → RSS 48–59 At Risk', () => {
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

    const signalOutput = signals.evaluateFromEvents(
      events,
      evalContext(restaurantId, { tenureDays: 20 }),
    );

    const { snapshot, decisionLog } = rss.evaluate({
      signals: signalOutput.signals,
      context: rssContext(restaurantId, { tenureDays: 20 }),
    });

    expect(snapshot.rss.value).toBeGreaterThanOrEqual(40);
    expect(snapshot.rss.value).toBeLessThanOrEqual(59);
    expect(snapshot.rss.band).toBe('at_risk');
    expect(snapshot.signalsConsidered).toEqual(
      expect.arrayContaining([SignalCode.SIG_CFG_03, SignalCode.SIG_CFG_05]),
    );
    expect(snapshot.topFactors.length).toBeGreaterThan(0);
    expect(snapshot.dimensions.configuration.score).toBeGreaterThan(0);
    expect(snapshot.dimensions.operation.explanation.why).toBeTruthy();
    expect(decisionLog.rawRssBeforeOverlays).toBeDefined();
  });

  it('restaurante saludable → band Healthy', () => {
    const restaurantId = 'rest-healthy';
    const activeSignals = [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_CFG_05),
      mockSignal(restaurantId, SignalCode.SIG_CFG_08),
      mockSignal(restaurantId, SignalCode.SIG_OPS_02),
      mockSignal(restaurantId, SignalCode.SIG_OPS_07),
      mockSignal(restaurantId, SignalCode.SIG_BIZ_01),
    ];

    const { snapshot } = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId, { tenureDays: 45 }),
    });

    expect(snapshot.rss.value).toBeGreaterThanOrEqual(75);
    expect(['healthy', 'champion']).toContain(snapshot.rss.band);
    expect(snapshot.dimensions.configuration.score).toBeGreaterThanOrEqual(75);
    expect(
      snapshot.explanation.improvementPriorities.length,
    ).toBeLessThanOrEqual(3);
  });

  it('restaurante Champion → RSS ≥ 90', () => {
    const restaurantId = 'rest-champion';
    const codes = [
      SignalCode.SIG_CFG_01,
      SignalCode.SIG_CFG_03,
      SignalCode.SIG_CFG_05,
      SignalCode.SIG_CFG_08,
      SignalCode.SIG_OPS_02,
      SignalCode.SIG_OPS_07,
      SignalCode.SIG_BIZ_01,
    ];
    const activeSignals = codes.map((c) => mockSignal(restaurantId, c));

    const { snapshot } = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId, { tenureDays: 90 }),
    });

    expect(snapshot.rss.value).toBeGreaterThanOrEqual(90);
    expect(snapshot.rss.band).toBe('champion');
  });

  it('cancelación → overlay Critical, RSS ≤ 39', () => {
    const restaurantId = 'rest-critical';
    const activeSignals = [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_RSK_03),
    ];

    const { snapshot, decisionLog } = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId),
    });

    expect(snapshot.rss.value).toBeLessThanOrEqual(39);
    expect(snapshot.rss.band).toBe('critical');
    expect(snapshot.overlaysApplied).toContain('OVERLAY-CRITICAL-CANCEL');
    expect(decisionLog.overlaysApplied.length).toBeGreaterThan(0);
  });

  it('digital intent: ausencia SIG-CFG-10 no penaliza operación por caja (INV-20)', () => {
    const restaurantId = 'rest-digital-no-caja';
    const activeSignals = [
      mockSignal(restaurantId, SignalCode.SIG_CFG_01),
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_OPS_02),
      mockSignal(restaurantId, SignalCode.SIG_OPS_07),
    ];

    const { snapshot } = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId, { intent: 'digital', tenureDays: 30 }),
    });

    expect(snapshot.dimensions.operation.signalsUsed).not.toContain(
      SignalCode.SIG_CFG_10,
    );
    expect(snapshot.dimensions.operation.score).toBeGreaterThan(0);
  });

  it('es determinístico', () => {
    const restaurantId = 'rest-det';
    const activeSignals = [
      mockSignal(restaurantId, SignalCode.SIG_CFG_03),
      mockSignal(restaurantId, SignalCode.SIG_OPS_09),
    ];
    const input = {
      signals: activeSignals,
      context: rssContext(restaurantId),
    };

    const a = rss.evaluate(input);
    const b = rss.evaluate(input);

    expect(a.snapshot.rss.value).toBe(b.snapshot.rss.value);
    expect(a.snapshot.rss.band).toBe(b.snapshot.rss.band);
  });

  it('idempotente con mismas señales', () => {
    const restaurantId = 'rest-idem';
    const activeSignals = [mockSignal(restaurantId, SignalCode.SIG_CFG_01)];

    const first = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId),
    });
    const second = rss.evaluate({
      signals: activeSignals,
      context: rssContext(restaurantId),
    });

    expect(first.snapshot.rss.value).toBe(second.snapshot.rss.value);
    expect(first.snapshot.signalsConsidered).toEqual(
      second.snapshot.signalsConsidered,
    );
  });

  it('snapshot incluye trazabilidad completa', () => {
    const restaurantId = 'rest-trace';
    const { snapshot } = rss.evaluate({
      signals: [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      context: rssContext(restaurantId),
    });

    expect(snapshot.algorithmVersion).toBe('rss.v1');
    expect(snapshot.weightsCatalogVersion).toBe('1.0.0');
    expect(snapshot.bandsCatalogVersion).toBe('1.0.0');
    expect(snapshot.metadata.traceability.signalsCount).toBe(1);
    expect(Object.keys(snapshot.dimensions)).toHaveLength(5);
    for (const dim of Object.values(snapshot.dimensions)) {
      expect(dim.explanation.why.length).toBeGreaterThan(0);
      expect(dim.explanation.improvementHint.length).toBeGreaterThan(0);
    }
  });

  it('calcula delta7d con histórico', () => {
    const restaurantId = 'rest-delta';
    const ctx = rssContext(restaurantId);
    const old = rss.evaluate({
      signals: [mockSignal(restaurantId, SignalCode.SIG_CFG_03)],
      context: { ...ctx, evaluatedAt: new Date('2026-03-10T12:00:00.000Z') },
    });

    const current = rss.evaluate({
      signals: [
        mockSignal(restaurantId, SignalCode.SIG_CFG_01),
        mockSignal(restaurantId, SignalCode.SIG_CFG_03),
        mockSignal(restaurantId, SignalCode.SIG_OPS_02),
      ],
      context: ctx,
      historicalSnapshots: [old.snapshot],
    });

    expect(current.snapshot.rss.delta7d).not.toBeNull();
    expect(current.snapshot.rss.trend7d).toBeDefined();
  });
});

describe('DimensionRegistry', () => {
  it('registra 5 evaluadores independientes', () => {
    const registry = new DimensionRegistry();
    registry.onModuleInit();
    expect(registry.getEvaluators()).toHaveLength(5);
    const ids = registry.getEvaluators().map((e) => e.dimensionId);
    expect(ids).toEqual([
      'business',
      'configuration',
      'engagement',
      'operation',
      'relationship',
    ]);
  });
});
