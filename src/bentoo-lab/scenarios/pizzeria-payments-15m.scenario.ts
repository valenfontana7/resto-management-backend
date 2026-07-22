import { LabScenarioDefinition } from './scenario.types';

/** Escenario corto payments: checkout MP simulado + factura fiscal mock. */
export const PIZZERIA_PAYMENTS_15M_SCENARIO = {
  id: 'pizzeria-payments-15m',
  version: '1.0.0',
  label: 'Pizzería · payments · checkout MP + fiscal · 15 minutos',
  durationMinutes: 15,
  simulatedStartAt: '2026-07-17T23:00:00.000Z',
  defaultSpeed: 20,
  preferredLabProfile: 'ops-core',
  restaurant: {
    type: 'pizzeria',
    channels: ['online'],
  },
  menu: [
    {
      key: 'pizza-muzzarella',
      name: 'Pizza muzzarella',
      price: 8000,
      preparationMinutes: 12,
    },
    {
      key: 'fugazzeta',
      name: 'Fugazzeta',
      price: 9500,
      preparationMinutes: 15,
    },
  ],
  participants: ['client', 'manager', 'kitchen'],
  events: [
    {
      id: 'event.client.order.0001',
      type: 'CLIENT_CREATE_ONLINE_ORDER',
      participantKey: 'client',
      orderKey: 'order.online.0001',
      paymentMethod: 'mercadopago',
      atMinute: 1,
      priority: 10,
    },
    {
      id: 'event.payment.approve.0001',
      type: 'PAYMENT_SYNTHETIC_APPROVE',
      participantKey: 'system',
      orderKey: 'order.online.0001',
      atMinute: 3,
      priority: 20,
    },
    {
      id: 'event.fiscal.issue.0001',
      type: 'FISCAL_ISSUE_ORDER',
      participantKey: 'manager',
      orderKey: 'order.online.0001',
      documentType: 'FACTURA_B',
      customerName: 'Consumidor Final Lab',
      customerDocType: 'DNI',
      customerDocNumber: '30111222',
      atMinute: 6,
      priority: 30,
    },
    {
      id: 'event.simulation.complete',
      type: 'SIMULATION_COMPLETE',
      participantKey: 'system',
      atMinute: 15,
      priority: 100,
    },
  ],
  invariants: [
    'TENANT_SCOPE',
    'AUTHORIZED_ACTOR_ACTIONS',
    'EXTERNAL_EFFECTS_BLOCKED',
    'ORDER_STATE_VALIDITY',
    'EXPECTED_INCIDENTS_ONCE',
    'TIMELINE_CONTIGUOUS',
    'INCIDENT_REPLAY_DETERMINISM',
  ],
} as const satisfies LabScenarioDefinition;
