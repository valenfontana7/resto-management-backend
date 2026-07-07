export { RssEngineService, RssAggregatorService } from './rss-engine.service';
export { DimensionRegistry } from './dimension-registry.service';
export { InMemoryRssHistoryStore } from './stores/rss-history.store';
export { PrismaRssHistoryStore } from './stores/prisma-rss-history.store';
export {
  getRssAlgorithmVersion,
  getRssBandsCatalog,
  getRssWeightsCatalog,
  resolveBand,
  type RssBandId,
  type RssDimensionId,
} from './catalog/rss-catalog.loader';
export type {
  RestaurantSuccessSnapshot,
  RssEngineInput,
  RssEngineOutput,
  RssEngineContext,
  RssDecisionLog,
  DimensionEvaluationResult,
  SignalFactor,
} from './types/restaurant-success-snapshot.types';
