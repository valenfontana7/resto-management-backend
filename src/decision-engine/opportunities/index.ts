export { OpportunityEngineService } from './opportunity-engine.service';
export { OpportunityRegistry } from './opportunity-registry.service';
export { InMemoryOpportunityStateStore } from './stores/opportunity-state.store';
export {
  OpportunityCode,
  getOpportunityCatalogEntry,
  getOpportunityCatalogVersion,
} from './catalog/opportunity-catalog.loader';
export type {
  DetectedOpportunity,
  OpenOpportunityRecord,
  OpportunityEngineInput,
  OpportunityEngineOutput,
} from './types/opportunity.types';
