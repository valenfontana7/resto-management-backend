import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DimensionEvaluator } from './dimensions/dimension-evaluator.interface';
import { ALL_DIMENSION_EVALUATORS } from './dimensions';

@Injectable()
export class DimensionRegistry implements OnModuleInit {
  private evaluators: DimensionEvaluator[] = [];

  onModuleInit(): void {
    for (const evaluator of ALL_DIMENSION_EVALUATORS) {
      this.register(evaluator);
    }
  }

  register(evaluator: DimensionEvaluator): void {
    this.evaluators.push(evaluator);
    this.evaluators.sort((a, b) => a.dimensionId.localeCompare(b.dimensionId));
  }

  getEvaluators(): readonly DimensionEvaluator[] {
    return this.evaluators;
  }
}
