export { DecisionEngineModule } from '../decision-engine.module';
export { SignalEngineService } from './signal-engine.service';
export { SignalRegistry } from './signal-registry.service';
export {
  SignalCode,
  getSignalCatalogEntry,
} from './catalog/signal-catalog.loader';
export type {
  ProducedSignal,
  SignalEngineInput,
  SignalEngineOutput,
} from './types/signal.types';
export type { EvaluationContext } from './types/evaluation-context.types';
export type { DecisionDomainEvent } from './types/domain-event.types';
export {
  DecisionDomainEventType,
  normalizeDomainEvent,
} from './types/domain-event.types';
export { InMemorySignalStateStore } from './stores/signal-state.store';
export { PrismaSignalStateStore } from './stores/prisma-signal-state.store';
