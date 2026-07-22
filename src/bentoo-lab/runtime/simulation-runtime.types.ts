import {
  LabIncidentCode,
  ObservedLabIncident,
} from '../incidents/lab-incident.types';
import { LabScenarioEvent } from '../scenarios/scenario.types';

export interface PreparedOrderChoice {
  orderKey: string;
  dishName: string;
  quantity: number;
  couponCode?: string;
  paymentMethod?: 'cash' | 'mercadopago';
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
  /** Clave lógica de sesión salón → TableSession.id */
  sessionIds: Record<string, string>;
  /** Clave lógica de reserva → Reservation.id */
  reservationIds: Record<string, string>;
  processedEventIds: string[];
  incidentCodes: LabIncidentCode[];
  kitchenDelayMinutes: number;
  observedIncidents: ObservedLabIncident[];
  inventoryItemId?: string;
  stockConsumed?: boolean;
  incidentFingerprint?: string;
}

import type { LabProfile } from '../bootstrap/lab-profile.types';

export interface CreateSimulationRunInput {
  scenarioId: string;
  repetitionKey: string;
  simulatedStartAt?: Date;
  incidentCodes?: readonly string[];
  labProfile?: LabProfile;
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
