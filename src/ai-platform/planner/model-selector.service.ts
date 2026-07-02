import { Injectable } from '@nestjs/common';

import type { PlanningContext } from '../types/planner.types';

import { ModelSelectionPolicyService } from '../pricing/model-selection-policy.service';

@Injectable()
export class ModelSelectorService {
  constructor(private readonly policy: ModelSelectionPolicyService) {}

  async selectModel(
    taskKey: string,

    context: PlanningContext,

    spentUsd = 0,
  ): Promise<string | undefined> {
    const budgetRemaining =
      context.budgetUsd != null ? context.budgetUsd - spentUsd : undefined;

    const result = await this.policy.select({
      taskKey,

      context: 'plan_compose',

      budgetRemainingUsd: budgetRemaining,
    });

    return result.model;
  }
}
