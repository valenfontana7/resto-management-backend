export { RecommendationEngineService } from './recommendation-engine.service';
export { RecommendationRegistry } from './recommendation-registry.service';
export { InMemoryRecommendationStateStore } from './stores/recommendation-state.store';
export { PrismaRecommendationStateStore } from './stores/prisma-recommendation-state.store';
export {
  RecommendationCode,
  getRecommendationCatalogEntry,
  getRecommendationCatalogVersion,
} from './catalog/recommendation-catalog.loader';
export {
  RecommendationStrategy,
  getStrategyEntry,
} from './catalog/strategy-catalog.loader';
export type {
  DetectedRecommendation,
  RecommendationEngineInput,
  RecommendationEngineOutput,
} from './types/recommendation.types';
