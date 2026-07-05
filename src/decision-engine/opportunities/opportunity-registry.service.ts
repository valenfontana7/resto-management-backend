import { Injectable, OnModuleInit } from '@nestjs/common';
import type { OpportunityEvaluator } from './evaluators';
import { ALL_OPPORTUNITY_EVALUATORS } from './evaluators';

/**
 * Discovers and orders opportunity evaluators. The engine never references concrete rules.
 */
@Injectable()
export class OpportunityRegistry implements OnModuleInit {
  private evaluators: OpportunityEvaluator[] = [];

  onModuleInit(): void {
    this.registerAll(ALL_OPPORTUNITY_EVALUATORS);
  }

  register(evaluator: OpportunityEvaluator): void {
    this.evaluators.push(evaluator);
    this.evaluators.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  registerAll(evaluators: OpportunityEvaluator[]): void {
    for (const evaluator of evaluators) {
      this.register(evaluator);
    }
  }

  getEvaluators(): readonly OpportunityEvaluator[] {
    return this.evaluators;
  }

  getEvaluatorCount(): number {
    return this.evaluators.length;
  }
}
