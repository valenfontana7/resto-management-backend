import { Injectable } from '@nestjs/common';
import {
  getDefaultExpireDays,
  getMaxOpenOpportunities,
  getOpportunityCatalogEntry,
  getOpportunityCatalogVersion,
  type OpportunityCategory,
  type OpportunityPriority,
} from './catalog/opportunity-catalog.loader';
import {
  isResolvedWhen,
  resolvedWhenReason,
} from './conditions/resolved-when.evaluator';
import {
  buildSnapshotView,
  daysBetween,
} from './context/snapshot-context.helper';
import { OpportunityRegistry } from './opportunity-registry.service';
import {
  createEmptyOpportunityDecisionLog,
  type OpportunityDecisionLog,
  type OpportunityEvaluatorRunLog,
  type OpportunityTransitionLog,
} from './types/opportunity-decision-log.types';
import type {
  DetectedOpportunity,
  OpenOpportunityRecord,
  OpportunityCloseRecord,
  OpportunityEngineInput,
  OpportunityEngineOutput,
} from './types/opportunity.types';

const PRIORITY_ORDER: Record<OpportunityPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CATEGORY_ORDER: Record<OpportunityCategory, number> = {
  risk: 0,
  gap: 1,
  expansion: 2,
  milestone: 3,
};

@Injectable()
export class OpportunityEngineService {
  constructor(private readonly registry: OpportunityRegistry) {}

  evaluate(input: OpportunityEngineInput): OpportunityEngineOutput {
    const view = buildSnapshotView(input.snapshot, input.context);
    const catalogVersion = getOpportunityCatalogVersion();
    const maxOpen = getMaxOpenOpportunities();
    const expireDays = getDefaultExpireDays();

    const decisionLog = createEmptyOpportunityDecisionLog(
      input.snapshot.restaurantId,
      view.evaluatedAt,
      catalogVersion,
    );

    const priorOpen = input.openOpportunities ?? [];
    const openByCode = new Map(priorOpen.map((o) => [o.code, o]));

    const detectedCandidates: DetectedOpportunity[] = [];
    const toClose: OpportunityCloseRecord[] = [];
    const toExpire: string[] = [];

    for (const open of priorOpen) {
      const entry = getOpportunityCatalogEntry(open.code as never);
      if (isResolvedWhen(entry.resolvedWhen, view)) {
        toClose.push({
          opportunityId: open.id,
          code: open.code,
          reason: resolvedWhenReason(entry.resolvedWhen, view),
          evidenceSignalIds: open.signalIds,
        });
        openByCode.delete(open.code);
        continue;
      }

      if (daysBetween(open.openedAt, view.evaluatedAt) >= expireDays) {
        toExpire.push(open.id);
        openByCode.delete(open.code);
      }
    }

    for (const evaluator of this.registry.getEvaluators()) {
      const started = Date.now();
      const result = evaluator.evaluate({ view });
      const durationMs = Date.now() - started;

      let discarded = false;
      let discardReason: string | undefined;

      if (result.detected) {
        const entry = getOpportunityCatalogEntry(evaluator.opportunityCode);

        if (
          entry.category === 'expansion' &&
          entry.suppressOnCriticalBand &&
          view.snapshot.rss.band === 'critical'
        ) {
          discarded = true;
          discardReason = 'Expansion suprimida en banda Critical';
        } else if (openByCode.has(result.detected.code)) {
          discarded = true;
          discardReason = 'Ya existe oportunidad abierta equivalente';
        } else {
          detectedCandidates.push(result.detected);
        }
      }

      const runLog: OpportunityEvaluatorRunLog = {
        ruleId: evaluator.ruleId,
        ruleVersion: evaluator.ruleVersion,
        opportunityCode: evaluator.opportunityCode,
        detected: result.detected !== null && !discarded,
        discarded,
        discardReason,
        reason: discarded ? (discardReason ?? result.reason) : result.reason,
        durationMs,
      };
      decisionLog.runs.push(runLog);
      decisionLog.evaluatorsRun += 1;
      if (runLog.detected) {
        decisionLog.evaluatorsDetected += 1;
      }
      if (discarded) {
        decisionLog.evaluatorsDiscarded += 1;
      }
    }

    const sortedCandidates = [...detectedCandidates].sort((a, b) =>
      this.compareOpportunities(a, b, view.snapshot.metadata.tenureDays),
    );

    const remainingSlots = Math.max(0, maxOpen - openByCode.size);
    const toOpen = sortedCandidates.slice(0, remainingSlots);
    const backlog = sortedCandidates.slice(remainingSlots);

    const transitions: OpportunityTransitionLog[] = [];

    for (const opp of toOpen) {
      transitions.push({
        transition: 'opportunity_opened',
        opportunityId: opp.id,
        code: opp.code,
        reason: opp.explanation,
        ruleId: opp.ruleId,
      });
    }

    for (const close of toClose) {
      transitions.push({
        transition: 'opportunity_closed',
        opportunityId: close.opportunityId,
        code: close.code,
        reason: close.reason,
        ruleId: getOpportunityCatalogEntry(close.code as never).ruleId,
      });
    }

    for (const expiredId of toExpire) {
      const code = expiredId.split(':').slice(1).join(':');
      transitions.push({
        transition: 'opportunity_expired',
        opportunityId: expiredId,
        code,
        reason: `Sin progreso en ${expireDays} días`,
        ruleId: getOpportunityCatalogEntry(code as never).ruleId,
      });
    }

    for (const opp of backlog) {
      transitions.push({
        transition: 'opportunity_backlogged',
        opportunityId: opp.id,
        code: opp.code,
        reason: `Límite de ${maxOpen} oportunidades abiertas alcanzado`,
        ruleId: opp.ruleId,
      });
    }

    decisionLog.transitions = transitions;
    decisionLog.summary = this.buildSummary(
      decisionLog,
      toOpen,
      toClose,
      backlog,
    );

    const openOpportunities: OpenOpportunityRecord[] = [
      ...openByCode.values(),
      ...toOpen.map((opp) => ({
        ...opp,
        openedAt: opp.createdAt,
        status: 'open' as const,
      })),
    ].sort((a, b) =>
      this.compareOpportunities(a, b, view.snapshot.metadata.tenureDays),
    );

    return {
      opportunities: openOpportunities.map((opp) => {
        const { openedAt, status, ...rest } = opp;
        void openedAt;
        void status;
        return rest;
      }),
      backlog,
      toOpen,
      toClose,
      toExpire,
      openOpportunities,
      decisionLog,
    };
  }

  private compareOpportunities(
    a: DetectedOpportunity,
    b: DetectedOpportunity,
    _tenureDays: number,
  ): number {
    void _tenureDays;
    const priorityDiff =
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const categoryDiff =
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (categoryDiff !== 0) return categoryDiff;

    return a.code.localeCompare(b.code);
  }

  private buildSummary(
    log: OpportunityDecisionLog,
    toOpen: DetectedOpportunity[],
    toClose: OpportunityCloseRecord[],
    backlog: DetectedOpportunity[],
  ): string {
    return [
      `Evaluators: ${log.evaluatorsRun} run, ${log.evaluatorsDetected} detected, ${log.evaluatorsDiscarded} discarded.`,
      `Open: ${toOpen.length}, close: ${toClose.length}, backlog: ${backlog.length}.`,
    ].join(' ');
  }
}
