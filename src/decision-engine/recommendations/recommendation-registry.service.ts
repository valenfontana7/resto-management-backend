import { Injectable, OnModuleInit } from '@nestjs/common';
import type { RecommendationEvaluator } from './evaluators';
import { ALL_RECOMMENDATION_EVALUATORS } from './evaluators';

/**
 * Discovers and orders recommendation evaluators. The engine never references concrete rules.
 */
@Injectable()
export class RecommendationRegistry implements OnModuleInit {
  private evaluators: RecommendationEvaluator[] = [];

  onModuleInit(): void {
    this.registerAll(ALL_RECOMMENDATION_EVALUATORS);
  }

  register(evaluator: RecommendationEvaluator): void {
    this.evaluators.push(evaluator);
    this.evaluators.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  registerAll(evaluators: RecommendationEvaluator[]): void {
    for (const evaluator of evaluators) {
      this.register(evaluator);
    }
  }

  getEvaluators(): readonly RecommendationEvaluator[] {
    return this.evaluators;
  }

  getEvaluatorCount(): number {
    return this.evaluators.length;
  }
}
