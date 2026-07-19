export interface LabScenarioMenuItem {
  key: string;
  name: string;
  price: number;
  preparationMinutes: number;
}

interface LabScenarioEventBase {
  id: string;
  atMinute: number;
  priority: number;
}

export interface ClientCreateOrderScenarioEvent extends LabScenarioEventBase {
  type: 'CLIENT_CREATE_ONLINE_ORDER';
  participantKey: 'client';
  orderKey: string;
}

export interface KitchenStartOrderScenarioEvent extends LabScenarioEventBase {
  type: 'KITCHEN_START_ORDER';
  participantKey: 'kitchen';
  orderKey: string;
}

export interface KitchenReadyOrderScenarioEvent extends LabScenarioEventBase {
  type: 'KITCHEN_READY_ORDER';
  participantKey: 'kitchen';
  orderKey: string;
}

export interface ManagerMarkOrderPaidScenarioEvent
  extends LabScenarioEventBase {
  type: 'MANAGER_MARK_ORDER_PAID';
  participantKey: 'manager';
  orderKey: string;
}

export interface IncidentKitchenDelayScenarioEvent
  extends LabScenarioEventBase {
  type: 'INCIDENT_KITCHEN_DELAY';
  participantKey: 'system';
  orderKey: string;
}

export interface IncidentStockoutScenarioEvent extends LabScenarioEventBase {
  type: 'INCIDENT_STOCKOUT';
  participantKey: 'manager';
  inventoryItemKey: string;
}

export interface CompleteSimulationScenarioEvent extends LabScenarioEventBase {
  type: 'SIMULATION_COMPLETE';
  participantKey: 'system';
}

export type LabScenarioEvent =
  | ClientCreateOrderScenarioEvent
  | KitchenStartOrderScenarioEvent
  | KitchenReadyOrderScenarioEvent
  | ManagerMarkOrderPaidScenarioEvent
  | IncidentKitchenDelayScenarioEvent
  | IncidentStockoutScenarioEvent
  | CompleteSimulationScenarioEvent;

export type LabScenarioInvariantKey =
  | 'TENANT_SCOPE'
  | 'ORDER_PREPARATION_CAUSALITY'
  | 'AUTHORIZED_ACTOR_ACTIONS'
  | 'EXTERNAL_EFFECTS_BLOCKED'
  | 'ORDER_STATE_VALIDITY'
  | 'EXPECTED_INCIDENTS_ONCE'
  | 'STOCK_NON_NEGATIVE'
  | 'TIMELINE_CONTIGUOUS'
  | 'INCIDENT_REPLAY_DETERMINISM';

export interface LabScenarioDefinition {
  id: string;
  version: string;
  label: string;
  durationMinutes: number;
  simulatedStartAt: string;
  defaultSpeed: 5 | 20 | 100;
  restaurant: {
    type: 'pizzeria';
    channels: readonly ['online'];
  };
  menu: readonly LabScenarioMenuItem[];
  participants: readonly ['client', 'kitchen', 'manager'];
  events: readonly LabScenarioEvent[];
  invariants: readonly LabScenarioInvariantKey[];
}
