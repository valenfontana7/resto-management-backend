import { BaseDimensionEvaluator } from './base-dimension.evaluator';

export class ConfigurationDimensionEvaluator extends BaseDimensionEvaluator {
  readonly dimensionId = 'configuration' as const;
}

export class OperationDimensionEvaluator extends BaseDimensionEvaluator {
  readonly dimensionId = 'operation' as const;
}

export class BusinessDimensionEvaluator extends BaseDimensionEvaluator {
  readonly dimensionId = 'business' as const;
}

export class AdoptionDimensionEvaluator extends BaseDimensionEvaluator {
  readonly dimensionId = 'engagement' as const;
}

export class RiskDimensionEvaluator extends BaseDimensionEvaluator {
  readonly dimensionId = 'relationship' as const;
}

export const ALL_DIMENSION_EVALUATORS = [
  new ConfigurationDimensionEvaluator(),
  new OperationDimensionEvaluator(),
  new BusinessDimensionEvaluator(),
  new AdoptionDimensionEvaluator(),
  new RiskDimensionEvaluator(),
];
