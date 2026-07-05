import type { ProducedSignal } from '../../signals/types/signal.types';
import type { RssDimensionId } from '../catalog/rss-catalog.loader';
import type { DimensionEvaluationResult } from '../types/restaurant-success-snapshot.types';
import type { RssEngineContext } from '../types/restaurant-success-snapshot.types';

export interface DimensionEvaluatorInput {
  signals: ProducedSignal[];
  context: RssEngineContext;
  activeCodes: Set<string>;
}

export interface DimensionEvaluator {
  readonly dimensionId: RssDimensionId;
  evaluate(input: DimensionEvaluatorInput): DimensionEvaluationResult;
}
