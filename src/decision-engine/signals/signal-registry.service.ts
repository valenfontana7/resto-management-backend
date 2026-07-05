import { Injectable, OnModuleInit } from '@nestjs/common';
import type { SignalEvaluator } from './evaluators/signal-evaluator.interface';
import { ALL_SIGNAL_EVALUATORS } from './evaluators';

/**
 * Discovers and orders signal evaluators. The engine never references concrete rules.
 */
@Injectable()
export class SignalRegistry implements OnModuleInit {
  private evaluators: SignalEvaluator[] = [];

  onModuleInit(): void {
    this.registerAll(ALL_SIGNAL_EVALUATORS);
  }

  register(evaluator: SignalEvaluator): void {
    this.evaluators.push(evaluator);
    this.evaluators.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  registerAll(evaluators: SignalEvaluator[]): void {
    for (const evaluator of evaluators) {
      this.register(evaluator);
    }
  }

  getEvaluators(): readonly SignalEvaluator[] {
    return this.evaluators;
  }

  getEvaluatorCount(): number {
    return this.evaluators.length;
  }
}
