import {
  getOpportunityCatalogEntry,
  type OpportunityCatalogEntry,
  type OpportunityCodeValue,
} from '../catalog/opportunity-catalog.loader';
import { SignalCode } from '../../signals/catalog/signal-catalog.loader';
import {
  deriveOpportunityConfidence,
  explainConfidence,
} from '../conditions/confidence.derivation';
import {
  deriveOpportunityPriority,
  explainPriority,
} from '../conditions/priority.derivation';
import type { SnapshotView } from '../context/snapshot-context.helper';
import {
  buildOpportunityId,
  buildSupportingSignals,
  configScore,
  countActivePillars,
  hasSignal,
  isRssBand,
  isSinglePillarActive,
  lacksSignal,
  resolveSignalIds,
} from '../context/snapshot-context.helper';
import type { DetectedOpportunity } from '../types/opportunity.types';
import { OPPORTUNITY_RULE_VERSION } from '../types/opportunity.types';

export interface OpportunityEvaluatorContext {
  view: SnapshotView;
}

export interface OpportunityEvaluatorResult {
  detected: DetectedOpportunity | null;
  reason: string;
}

export interface OpportunityEvaluator {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly opportunityCode: OpportunityCodeValue;
  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult;
}

export function buildDetectedOpportunity(
  entry: OpportunityCatalogEntry,
  view: SnapshotView,
  presentSignals: string[],
  absentSignals: string[],
  explanationBody: string,
  inferredFromRss: boolean,
): DetectedOpportunity {
  const supportingSignals = buildSupportingSignals(
    presentSignals,
    absentSignals,
  );
  const signalIds = resolveSignalIds(view, presentSignals);
  const priority = deriveOpportunityPriority(entry, view);
  const confidence = deriveOpportunityConfidence(
    entry,
    presentSignals,
    inferredFromRss,
  );

  const explanation = [
    explanationBody,
    explainPriority(entry, priority, view),
    explainConfidence(confidence, presentSignals, entry),
    `Job relacionado: ${entry.primaryJob}.`,
    `Resultado esperado: ${entry.expectedOutcome}`,
  ].join(' ');

  return {
    id: buildOpportunityId(view.snapshot.restaurantId, entry.code),
    code: entry.code,
    category: entry.category,
    priority,
    confidence,
    title: entry.title,
    description: entry.description,
    explanation,
    signalIds,
    rssDimensions: entry.rssDimensions,
    supportingSignals,
    expectedOutcome: entry.expectedOutcome,
    recommendedActionType: entry.recommendedActionType,
    primaryJob: entry.primaryJob,
    createdAt: view.evaluatedAt.toISOString(),
    ruleVersion: OPPORTUNITY_RULE_VERSION,
    ruleId: entry.ruleId,
  };
}

export class OppCfg01Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-CFG-01').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-CFG-01' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const condition =
      hasSignal(view, SignalCode.SIG_CFG_03) &&
      lacksSignal(view, SignalCode.SIG_CFG_01);

    if (!condition) {
      return {
        detected: null,
        reason: 'Carta no lista o sitio ya publicado',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_CFG_03],
        [SignalCode.SIG_CFG_01],
        'Existe porque la carta está lista (SIG-CFG-03) pero el sitio no está publicado (SIG-CFG-01 ausente).',
        false,
      ),
      reason: 'Menu ready without published site',
    };
  }
}

export class OppCfg02Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-CFG-02').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-CFG-02' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const condition =
      hasSignal(view, SignalCode.SIG_CFG_01) &&
      lacksSignal(view, SignalCode.SIG_CFG_05);

    if (!condition) {
      return {
        detected: null,
        reason: 'Sitio no publicado o pagos ya conectados',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_CFG_01],
        [SignalCode.SIG_CFG_05],
        'Existe porque el sitio está publicado (SIG-CFG-01) pero faltan pagos online (SIG-CFG-05 ausente).',
        false,
      ),
      reason: 'Published site without online payments',
    };
  }
}

export class OppCfg04Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-CFG-04').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-CFG-04' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;

    if (!hasSignal(view, SignalCode.SIG_CFG_09)) {
      return {
        detected: null,
        reason: 'Go-live no estancado',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_CFG_09],
        [],
        'Existe porque el go-live está estancado (SIG-CFG-09 activa).',
        false,
      ),
      reason: 'Go-live step stalled',
    };
  }
}

export class OppCfg05Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-CFG-05').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-CFG-05' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const condition =
      hasSignal(view, SignalCode.SIG_OPS_07) &&
      lacksSignal(view, SignalCode.SIG_CFG_07);

    if (!condition) {
      return {
        detected: null,
        reason: 'Sin operación semanal o equipo ya invitado',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_OPS_07],
        [SignalCode.SIG_CFG_07],
        'Existe porque hay operación semanal (SIG-OPS-07) pero un solo usuario activo (SIG-CFG-07 ausente).',
        false,
      ),
      reason: 'Weekly operation with single active user',
    };
  }
}

export class OppOps02Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-OPS-02').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-OPS-02' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const minConfig = entry.configMinimumScore ?? 70;
    const minTenure = entry.minimumTenureDays ?? 14;
    const noOrders = lacksSignal(view, SignalCode.SIG_OPS_02);
    const inactiveSignals = entry.inactiveSignals ?? [SignalCode.SIG_OPS_09];
    const inactive14d =
      inactiveSignals.some((code) => hasSignal(view, code)) ||
      view.snapshot.metadata.tenureDays >= minTenure;

    const condition = configScore(view) >= minConfig && noOrders && inactive14d;

    if (!condition) {
      return {
        detected: null,
        reason: `Config ${configScore(view)} < ${minConfig}, hay pedidos, o tenure < ${minTenure}d sin inactividad`,
      };
    }

    const present = [SignalCode.SIG_OPS_09].filter((c) => hasSignal(view, c));

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        present,
        [SignalCode.SIG_OPS_02],
        `Existe porque la configuración alcanza ${configScore(view)}/100 (umbral ${minConfig}) y no hay pedidos de valor en 14+ días.`,
        false,
      ),
      reason: 'Config sufficient without value orders in 14d',
    };
  }
}

export class OppRsk01Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-RSK-01').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-RSK-01' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;

    if (!isRssBand(view, entry.rssBands ?? ['at_risk', 'critical'])) {
      return {
        detected: null,
        reason: `RSS band ${view.snapshot.rss.band} outside at_risk/critical`,
      };
    }

    if (hasSignal(view, SignalCode.SIG_RSK_03)) {
      return {
        detected: null,
        reason: 'Suppressed: cancelación (OPP-RSK-03) tiene prioridad',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        view.snapshot.signalsConsidered.filter((c) =>
          view.snapshot.topFactors.some((f) => f.signalCode === c),
        ),
        [],
        `Existe porque el RSS está en banda ${view.snapshot.rss.bandLabel} (${view.snapshot.rss.value}/100).`,
        true,
      ),
      reason: 'RSS at_risk or critical',
    };
  }
}

export class OppRsk03Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-RSK-03').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-RSK-03' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;

    if (!hasSignal(view, SignalCode.SIG_RSK_03)) {
      return {
        detected: null,
        reason: 'No cancelación iniciada',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_RSK_03],
        [],
        'Existe porque hay cancelación iniciada (SIG-RSK-03).',
        false,
      ),
      reason: 'Cancel requested',
    };
  }
}

export class OppRsk05Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-RSK-05').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-RSK-05' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const trialDay = view.context.trialDay ?? null;
    const minTrial = entry.minimumTrialDay ?? 10;

    if (!hasSignal(view, SignalCode.SIG_RSK_08)) {
      return {
        detected: null,
        reason: 'SIG-RSK-08 no activa',
      };
    }

    if (entry.requiresTrialContext && trialDay === null) {
      return {
        detected: null,
        reason: 'Requiere trialDay en contexto complementario',
      };
    }

    if (trialDay !== null && trialDay < minTrial) {
      return {
        detected: null,
        reason: `Trial day ${trialDay} < ${minTrial}`,
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_RSK_08],
        [],
        `Existe porque el trial (día ${trialDay ?? '?'}) superó ${minTrial} sin hito de valor (SIG-RSK-08).`,
        false,
      ),
      reason: 'Trial without milestone',
    };
  }
}

export class OppRsk07Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-RSK-07').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-RSK-07' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const minTenure = entry.minimumTenureDays ?? 45;
    const minScore = entry.singlePillarMinimumScore ?? 60;

    const condition =
      view.snapshot.metadata.tenureDays >= minTenure &&
      isSinglePillarActive(view, minScore);

    if (!condition) {
      return {
        detected: null,
        reason: `Tenure ${view.snapshot.metadata.tenureDays}d o múltiples pilares activos`,
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [],
        [],
        `Existe porque tras ${view.snapshot.metadata.tenureDays} días solo un pilar supera ${minScore}/100.`,
        true,
      ),
      reason: 'Single pillar active after 45d',
    };
  }
}

export class OppExp04Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-EXP-04').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-EXP-04' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const minScore = entry.minimumPillarScore ?? 60;
    const minPillars = entry.minimumActivePillars ?? 2;

    if (entry.suppressOnCriticalBand && view.snapshot.rss.band === 'critical') {
      return {
        detected: null,
        reason: 'Expansion suprimida en banda Critical',
      };
    }

    const condition =
      isRssBand(view, entry.rssBands ?? ['healthy', 'champion']) &&
      countActivePillars(view, minScore) >= minPillars;

    if (!condition) {
      return {
        detected: null,
        reason: 'RSS o pilares insuficientes para expansión',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        view.snapshot.signalsConsidered.filter((c) =>
          ['SIG-OPS-02', 'SIG-OPS-07', 'SIG-BIZ-01'].includes(c),
        ),
        [],
        `Existe porque el RSS está ${view.snapshot.rss.bandLabel} con ${countActivePillars(view, minScore)} pilares activos.`,
        true,
      ),
      reason: 'Healthy with multiple active pillars',
    };
  }
}

export class OppExp06Evaluator implements OpportunityEvaluator {
  readonly ruleId = getOpportunityCatalogEntry('OPP-EXP-06').ruleId;
  readonly ruleVersion = OPPORTUNITY_RULE_VERSION;
  readonly opportunityCode = 'OPP-EXP-06' as const;

  evaluate(ctx: OpportunityEvaluatorContext): OpportunityEvaluatorResult {
    const entry = getOpportunityCatalogEntry(this.opportunityCode);
    const { view } = ctx;
    const maxTenure = entry.maximumTenureDays ?? 30;

    const condition =
      hasSignal(view, SignalCode.SIG_OPS_02) &&
      view.snapshot.metadata.tenureDays <= maxTenure &&
      lacksSignal(view, SignalCode.SIG_OPS_07);

    if (!condition) {
      return {
        detected: null,
        reason: 'Primer pedido no reciente o operación ya sostenida',
      };
    }

    return {
      detected: buildDetectedOpportunity(
        entry,
        view,
        [SignalCode.SIG_OPS_02],
        [],
        'Existe porque se registró el primer pedido de valor (SIG-OPS-02) — hito temprano de operación.',
        false,
      ),
      reason: 'First order milestone',
    };
  }
}

export const ALL_OPPORTUNITY_EVALUATORS: OpportunityEvaluator[] = [
  new OppCfg01Evaluator(),
  new OppCfg02Evaluator(),
  new OppCfg04Evaluator(),
  new OppCfg05Evaluator(),
  new OppOps02Evaluator(),
  new OppRsk01Evaluator(),
  new OppRsk03Evaluator(),
  new OppRsk05Evaluator(),
  new OppRsk07Evaluator(),
  new OppExp04Evaluator(),
  new OppExp06Evaluator(),
];
