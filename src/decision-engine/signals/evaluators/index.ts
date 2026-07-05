import {
  getSignalCatalogEntry,
  SignalCode,
  type SignalCodeValue,
} from '../catalog/signal-catalog.loader';
import {
  daysSince,
  getLatestEventIds,
  findPriorSignal,
} from '../context/restaurant-signal-context.builder';
import { DecisionDomainEventType } from '../types/domain-event.types';
import { createProducedSignal } from '../types/signal.types';
import {
  RULE_VERSION,
  type SignalEvaluator,
  type SignalEvaluatorContext,
  type SignalEvaluatorResult,
} from './signal-evaluator.interface';

function positiveResult(
  ctx: SignalEvaluatorContext,
  ruleId: string,
  code: SignalCodeValue,
  condition: boolean,
  sourceEventIds: string[],
  fireReason: string,
  expireReason: string,
): SignalEvaluatorResult {
  if (condition) {
    const prior = findPriorSignal(ctx.priorState, code);
    return {
      activated: createProducedSignal({
        restaurantId: ctx.context.restaurantId,
        entry: getSignalCatalogEntry(code),
        ruleId,
        ruleVersion: RULE_VERSION,
        sourceEventIds,
        detectedAt: prior?.detectedAt ?? ctx.context.evaluatedAt,
      }),
      expiredCodes: [],
      reason: fireReason,
      traceEventIds: sourceEventIds,
    };
  }
  return {
    activated: null,
    expiredCodes: [code],
    reason: expireReason,
    traceEventIds: [],
  };
}

export class SitePublishedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-01';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_01;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.SitePublished,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_01,
      ctx.restaurantContext.sitePublished,
      ids,
      'Site is published',
      'Site is not published',
    );
  }
}

export class SiteUnpublishedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-02';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_02;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const condition =
      ctx.restaurantContext.siteEverPublished &&
      !ctx.restaurantContext.sitePublished;
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.SiteUnpublished,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_02,
      condition,
      ids,
      'Site unpublished after being live',
      'Site not in unpublished-after-live state',
    );
  }
}

export class MenuReadyEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-03';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_03;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.MenuReady,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_03,
      ctx.restaurantContext.menuReady,
      ids,
      'Menu is sellable',
      'Menu is not ready',
    );
  }
}

export class PaymentsConnectedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-05';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_05;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.PaymentsOnlineConnected,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_05,
      ctx.restaurantContext.paymentsOnlineConnected,
      ids,
      'Online payments connected',
      'Online payments not connected',
    );
  }
}

export class PaymentsFailedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-06';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_06;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.PaymentsConnectionFailed,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_06,
      ctx.restaurantContext.paymentsConnectionFailed,
      ids,
      'Payment connection failed',
      'No payment connection failure',
    );
  }
}

export class GoliveCompleteEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-08';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_08;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.GoliveCompleted,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_08,
      ctx.restaurantContext.goliveCompleted,
      ids,
      'Go-live configuration complete',
      'Go-live not complete',
    );
  }
}

export class GoliveStalledEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-09';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_09;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.GoliveStepStalled,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_09,
      ctx.restaurantContext.goliveStepStalled,
      ids,
      'Go-live step stalled',
      'Go-live not stalled',
    );
  }
}

export class SalonDesktopReadyEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-CFG-10';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_CFG_10;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.SalonDesktopReady,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_CFG_10,
      ctx.restaurantContext.salonDesktopReady,
      ids,
      'Salon cash register connected',
      'Salon cash register not connected',
    );
  }
}

export class FirstOrderEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-OPS-02';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_OPS_02;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = ctx.restaurantContext.paidOrderEventIds.slice(0, 1);
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_OPS_02,
      ctx.restaurantContext.hasPaidOrder,
      ids,
      'First paid order recorded',
      'No paid order yet',
    );
  }
}

export class WeeklyOperationEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-OPS-07';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_OPS_07;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const condition = ctx.restaurantContext.ordersLast7Days >= 1;
    const ids = ctx.restaurantContext.paidOrderEventIds.slice(-1);
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_OPS_07,
      condition,
      ids,
      'Operational activity in last 7 days',
      'No operational activity in last 7 days',
    );
  }
}

export class NoOperation14dEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-OPS-09';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_OPS_09;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const inactiveDays = daysSince(
      ctx.restaurantContext.lastValueEventAt,
      ctx.context.evaluatedAt,
    );
    const condition =
      inactiveDays === null
        ? ctx.restaurantContext.tenureDays >= 14
        : inactiveDays >= 14;

    if (condition) {
      return {
        activated: createProducedSignal({
          restaurantId: ctx.context.restaurantId,
          entry: getSignalCatalogEntry(SignalCode.SIG_OPS_09),
          ruleId: this.ruleId,
          ruleVersion: RULE_VERSION,
          sourceEventIds: [],
          detectedAt: ctx.context.evaluatedAt,
          metadata: { inactiveDays },
        }),
        expiredCodes: [],
        reason: `No value activity for ${inactiveDays ?? 'tenure'} days`,
        traceEventIds: [],
      };
    }
    return {
      activated: null,
      expiredCodes: [SignalCode.SIG_OPS_09],
      reason: 'Value activity within 14 days',
      traceEventIds: [],
    };
  }
}

export class OwnChannelOrdersEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-BIZ-01';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_BIZ_01;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = ctx.restaurantContext.paidOrderEventIds;
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_BIZ_01,
      ctx.restaurantContext.paidOrderCount > 0,
      ids,
      'Direct channel orders present',
      'No direct channel orders',
    );
  }
}

export class VolumeDropEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-BIZ-03';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_BIZ_03;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const { ordersBaselineWindow, ordersLast7Days, paidOrderCount } =
      ctx.restaurantContext;
    const baselineWeekly =
      ordersBaselineWindow / (ctx.context.baseline?.windowWeeks ?? 8);
    const condition =
      paidOrderCount >= 5 &&
      baselineWeekly >= 1 &&
      ordersLast7Days < baselineWeekly * 0.6;

    if (condition) {
      return {
        activated: createProducedSignal({
          restaurantId: ctx.context.restaurantId,
          entry: getSignalCatalogEntry(SignalCode.SIG_BIZ_03),
          ruleId: this.ruleId,
          ruleVersion: RULE_VERSION,
          sourceEventIds: [],
          detectedAt: ctx.context.evaluatedAt,
          metadata: { ordersLast7Days, baselineWeekly },
        }),
        expiredCodes: [],
        reason: 'Order volume dropped vs baseline',
        traceEventIds: [],
      };
    }
    return {
      activated: null,
      expiredCodes: [SignalCode.SIG_BIZ_03],
      reason: 'Volume within baseline range',
      traceEventIds: [],
    };
  }
}

export class ConfigRevertedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-RSK-02';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_RSK_02;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = [
      ...getLatestEventIds(
        ctx.restaurantContext,
        DecisionDomainEventType.SiteUnpublished,
      ),
      ...getLatestEventIds(
        ctx.restaurantContext,
        DecisionDomainEventType.PaymentsConnectionFailed,
      ),
      ...getLatestEventIds(
        ctx.restaurantContext,
        DecisionDomainEventType.MenuEmpty,
      ),
    ];
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_RSK_02,
      ctx.restaurantContext.configReverted,
      ids,
      'Configuration reverted',
      'No configuration reversion detected',
    );
  }
}

export class CancelRequestedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-RSK-03';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_RSK_03;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.SubscriptionCancelRequested,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_RSK_03,
      ctx.restaurantContext.cancelRequested,
      ids,
      'Subscription cancellation requested',
      'No cancellation request',
    );
  }
}

export class SubscriptionPaymentFailedEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-RSK-06';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_RSK_06;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const ids = getLatestEventIds(
      ctx.restaurantContext,
      DecisionDomainEventType.SubscriptionPaymentFailed,
    );
    return positiveResult(
      ctx,
      this.ruleId,
      SignalCode.SIG_RSK_06,
      ctx.restaurantContext.subscriptionPaymentFailed,
      ids,
      'Subscription payment failed',
      'Subscription payment OK',
    );
  }
}

export class TrialNoMilestoneEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-RSK-08';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_RSK_08;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const trialDay = ctx.restaurantContext.trialDay;
    const condition =
      trialDay !== null &&
      trialDay >= 10 &&
      !ctx.restaurantContext.hasPaidOrder &&
      !ctx.restaurantContext.goliveCompleted;

    if (condition) {
      return {
        activated: createProducedSignal({
          restaurantId: ctx.context.restaurantId,
          entry: getSignalCatalogEntry(SignalCode.SIG_RSK_08),
          ruleId: this.ruleId,
          ruleVersion: RULE_VERSION,
          sourceEventIds: [],
          detectedAt: ctx.context.evaluatedAt,
          metadata: { trialDay },
        }),
        expiredCodes: [],
        reason: `Trial day ${trialDay} without value milestone`,
        traceEventIds: [],
      };
    }
    return {
      activated: null,
      expiredCodes: [SignalCode.SIG_RSK_08],
      reason: 'Trial milestone met or trial day below threshold',
      traceEventIds: [],
    };
  }
}

export class EngagementInactivityEvaluator implements SignalEvaluator {
  readonly ruleId = 'RULE-ENG-01';
  readonly ruleVersion = RULE_VERSION;
  readonly signalCode = SignalCode.SIG_ENG_01;

  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult {
    const inactiveDays = daysSince(
      ctx.restaurantContext.lastValueEventAt,
      ctx.context.evaluatedAt,
    );
    const condition =
      inactiveDays === null
        ? ctx.restaurantContext.tenureDays >= 14
        : inactiveDays >= 14;

    if (condition) {
      return {
        activated: createProducedSignal({
          restaurantId: ctx.context.restaurantId,
          entry: getSignalCatalogEntry(SignalCode.SIG_ENG_01),
          ruleId: this.ruleId,
          ruleVersion: RULE_VERSION,
          sourceEventIds: [],
          detectedAt: ctx.context.evaluatedAt,
          metadata: { inactiveDays },
        }),
        expiredCodes: [],
        reason: `Last value activity ${inactiveDays ?? 'never'} days ago`,
        traceEventIds: [],
      };
    }
    return {
      activated: null,
      expiredCodes: [SignalCode.SIG_ENG_01],
      reason: 'Recent value activity',
      traceEventIds: [],
    };
  }
}

export const ALL_SIGNAL_EVALUATORS: SignalEvaluator[] = [
  new SitePublishedEvaluator(),
  new SiteUnpublishedEvaluator(),
  new MenuReadyEvaluator(),
  new PaymentsConnectedEvaluator(),
  new PaymentsFailedEvaluator(),
  new GoliveCompleteEvaluator(),
  new GoliveStalledEvaluator(),
  new SalonDesktopReadyEvaluator(),
  new FirstOrderEvaluator(),
  new WeeklyOperationEvaluator(),
  new NoOperation14dEvaluator(),
  new OwnChannelOrdersEvaluator(),
  new VolumeDropEvaluator(),
  new ConfigRevertedEvaluator(),
  new CancelRequestedEvaluator(),
  new SubscriptionPaymentFailedEvaluator(),
  new TrialNoMilestoneEvaluator(),
  new EngagementInactivityEvaluator(),
];
