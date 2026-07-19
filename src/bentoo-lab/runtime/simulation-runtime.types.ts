import {
  LabIncidentCode,
  ObservedLabIncident,
} from '../incidents/lab-incident.types';
import { LabScenarioEvent } from '../scenarios/scenario.types';

export interface PreparedOrderChoice {
  orderKey: string;
  dishName: string;
  quantity: number;
}

export type RuntimeQueueEvent = LabScenarioEvent & {
  atMs: number;
  delayMinutes?: number;
};

export interface PersistedSimulationRuntimeState {
  queue: RuntimeQueueEvent[];
  random: {
    algorithm: 'xorshift32';
    state: number;
  };
  orderChoices: Record<string, PreparedOrderChoice>;
  orderIds: Record<string, string>;
  processedEventIds: string[];
  incidentCodes: LabIncidentCode[];
  kitchenDelayMinutes: number;
  observedIncidents: ObservedLabIncident[];
  inventoryItemId?: string;
  stockConsumed?: boolean;
  incidentFingerprint?: string;
}

export interface CreateSimulationRunInput {
  scenarioId: string;
  repetitionKey: string;
  simulatedStartAt?: Date;
  incidentCodes?: readonly string[];
}

export interface LabOrderStatusSummary {
  status: string;
  count: number;
}

export interface LabStockSnapshotItem {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  autoDisableDishes: boolean;
}

export interface SimulationRunDiagnostics {
  incidentCodes: LabIncidentCode[];
  observedIncidents: ObservedLabIncident[];
  kitchenDelayMinutes: number;
  pendingEventIds: string[];
  ordersByStatus: LabOrderStatusSummary[];
  stock: LabStockSnapshotItem[];
  stockConsumed: boolean;
  incidentFingerprint: string | null;
}

export interface SimulationRunView {
  id: string;
  scenarioId: string;
  scenarioVersion: string;
  repetitionKey: string;
  status: string;
  restaurantId: string | null;
  simulatedStartAt: Date;
  simulatedNow: Date;
  visualSpeed: number;
  pendingEvents: number;
  invariantResults: unknown;
  diagnostics: SimulationRunDiagnostics;
}
