import { SignalEngineService } from './signal-engine.service';
import { SignalRegistry } from './signal-registry.service';
import { SignalCode } from './catalog/signal-catalog.loader';
import {
  DecisionDomainEventType,
  normalizeDomainEvent,
} from './types/domain-event.types';
import {
  DEFAULT_MODEL_VERSION,
  DEFAULT_RULE_CATALOG_VERSION,
  type EvaluationContext,
} from './types/evaluation-context.types';

function createEngine(): SignalEngineService {
  const registry = new SignalRegistry();
  registry.onModuleInit();
  return new SignalEngineService(registry);
}

function baseContext(
  restaurantId: string,
  overrides: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    restaurantId,
    evaluatedAt: new Date('2026-03-20T12:00:00.000Z'),
    intent: 'digital',
    tenureDays: 20,
    trialDay: null,
    modelVersion: DEFAULT_MODEL_VERSION,
    ruleCatalogVersion: DEFAULT_RULE_CATALOG_VERSION,
    ...overrides,
  };
}

function activeCodes(
  output: ReturnType<SignalEngineService['evaluate']>,
): string[] {
  return output.signals.map((s) => s.code).sort();
}

describe('SignalEngineService golden', () => {
  const engine = createEngine();

  it('La Parrilla Norte: menu + payments, no site, no orders 20d', () => {
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

    const output = engine.evaluateFromEvents(
      events,
      baseContext(restaurantId, { tenureDays: 20 }),
    );

    expect(activeCodes(output)).toEqual(
      expect.arrayContaining([
        SignalCode.SIG_CFG_03,
        SignalCode.SIG_CFG_05,
        SignalCode.SIG_OPS_09,
        SignalCode.SIG_ENG_01,
      ]),
    );
    expect(activeCodes(output)).not.toContain(SignalCode.SIG_CFG_01);
    expect(activeCodes(output)).not.toContain(SignalCode.SIG_OPS_02);

    for (const signal of output.signals) {
      expect(signal.ruleVersion).toBe('1.0.0');
      expect(signal.primaryJob).toBeTruthy();
      expect(signal.explanation).toBeTruthy();
    }

    expect(output.decisionLog.evaluatorsRun).toBeGreaterThanOrEqual(15);
    expect(output.decisionLog.runs.every((r) => r.reason.length > 0)).toBe(
      true,
    );
  });

  it('Café Centro Healthy: published site + recurring orders', () => {
    const restaurantId = 'rest-cafe-centro';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.SitePublished,
        payload: {},
        occurredAt: '2026-03-01T10:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-2',
        restaurantId,
        type: DecisionDomainEventType.MenuReady,
        payload: {},
        occurredAt: '2026-03-01T11:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-3',
        restaurantId,
        type: DecisionDomainEventType.PaymentsOnlineConnected,
        payload: {},
        occurredAt: '2026-03-02T10:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-4',
        restaurantId,
        type: DecisionDomainEventType.OrderPaid,
        payload: { channel: 'direct' },
        occurredAt: '2026-03-18T10:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-5',
        restaurantId,
        type: DecisionDomainEventType.OrderPaid,
        payload: { channel: 'direct' },
        occurredAt: '2026-03-19T10:00:00.000Z',
        source: 'test',
      }),
    ];

    const output = engine.evaluateFromEvents(
      events,
      baseContext(restaurantId, { tenureDays: 30 }),
    );

    expect(activeCodes(output)).toEqual(
      expect.arrayContaining([
        SignalCode.SIG_CFG_01,
        SignalCode.SIG_CFG_03,
        SignalCode.SIG_CFG_05,
        SignalCode.SIG_OPS_02,
        SignalCode.SIG_OPS_07,
        SignalCode.SIG_BIZ_01,
      ]),
    );
    expect(activeCodes(output)).not.toContain(SignalCode.SIG_OPS_09);
  });

  it('Critical: subscription cancel requested', () => {
    const restaurantId = 'rest-cancel';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.SubscriptionCancelRequested,
        payload: {},
        occurredAt: '2026-03-19T10:00:00.000Z',
        source: 'test',
      }),
    ];

    const output = engine.evaluateFromEvents(events, baseContext(restaurantId));

    expect(activeCodes(output)).toContain(SignalCode.SIG_RSK_03);
    const cancelSignal = output.signals.find(
      (s) => s.code === SignalCode.SIG_RSK_03,
    );
    expect(cancelSignal?.sourceEventIds).toEqual(['ev-1']);
  });

  it('Site unpublished after publish triggers SIG-CFG-02 and SIG-RSK-02', () => {
    const restaurantId = 'rest-unpublish';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.SitePublished,
        payload: {},
        occurredAt: '2026-03-01T10:00:00.000Z',
        source: 'test',
      }),
      normalizeDomainEvent({
        id: 'ev-2',
        restaurantId,
        type: DecisionDomainEventType.SiteUnpublished,
        payload: {},
        occurredAt: '2026-03-10T10:00:00.000Z',
        source: 'test',
      }),
    ];

    const output = engine.evaluateFromEvents(
      events,
      baseContext(restaurantId, { tenureDays: 15 }),
    );

    expect(activeCodes(output)).toContain(SignalCode.SIG_CFG_02);
    expect(activeCodes(output)).toContain(SignalCode.SIG_RSK_02);
    expect(activeCodes(output)).not.toContain(SignalCode.SIG_CFG_01);
  });

  it('Trial day 10 without milestone triggers SIG-RSK-08', () => {
    const restaurantId = 'rest-trial';
    const output = engine.evaluateFromEvents(
      [],
      baseContext(restaurantId, { trialDay: 10, tenureDays: 10 }),
    );

    expect(activeCodes(output)).toContain(SignalCode.SIG_RSK_08);
  });

  it('is deterministic for identical inputs', () => {
    const restaurantId = 'rest-det';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.MenuReady,
        payload: {},
        occurredAt: '2026-03-05T10:00:00.000Z',
        source: 'test',
      }),
    ];
    const context = baseContext(restaurantId);

    const a = engine.evaluateFromEvents(events, context);
    const b = engine.evaluateFromEvents(events, context);

    expect(activeCodes(a)).toEqual(activeCodes(b));
    expect(a.signals.length).toBe(b.signals.length);
  });

  it('re-evaluating with same events does not duplicate signal ids', () => {
    const restaurantId = 'rest-idem';
    const events = [
      normalizeDomainEvent({
        id: 'ev-1',
        restaurantId,
        type: DecisionDomainEventType.OrderPaid,
        payload: {},
        occurredAt: '2026-03-18T10:00:00.000Z',
        source: 'test',
      }),
    ];
    const context = baseContext(restaurantId, { tenureDays: 5 });

    const first = engine.evaluateFromEvents(events, context);
    const second = engine.evaluateFromEvents(events, context, first.signals);

    expect(
      second.signals.filter((s) => s.code === SignalCode.SIG_OPS_02),
    ).toHaveLength(1);
    const ops02 = second.signals.find((s) => s.code === SignalCode.SIG_OPS_02);
    expect(ops02?.id).toBe(`${restaurantId}:${SignalCode.SIG_OPS_02}`);
  });

  it('user.logged_in alone does not activate value signals', () => {
    const restaurantId = 'rest-login-only';
    const events = [
      normalizeDomainEvent({
        id: 'ev-login',
        restaurantId,
        type: DecisionDomainEventType.UserLoggedIn,
        payload: {},
        occurredAt: '2026-03-19T10:00:00.000Z',
        source: 'test',
      }),
    ];

    const output = engine.evaluateFromEvents(
      events,
      baseContext(restaurantId, { tenureDays: 3 }),
    );

    expect(activeCodes(output)).not.toContain(SignalCode.SIG_OPS_02);
    expect(activeCodes(output)).not.toContain(SignalCode.SIG_OPS_07);
  });

  it('decision log records fired and non-fired evaluators', () => {
    const restaurantId = 'rest-log';
    const output = engine.evaluateFromEvents([], baseContext(restaurantId));

    expect(output.decisionLog.runs.length).toBeGreaterThan(0);
    const fired = output.decisionLog.runs.filter((r) => r.fired);
    const notFired = output.decisionLog.runs.filter((r) => !r.fired);
    expect(fired.length).toBeGreaterThan(0);
    expect(notFired.length).toBeGreaterThan(0);
  });
});

describe('SignalRegistry', () => {
  it('registers evaluators sorted by ruleId without duplicates', () => {
    const registry = new SignalRegistry();
    registry.onModuleInit();
    const ids = registry.getEvaluators().map((e) => e.ruleId);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
