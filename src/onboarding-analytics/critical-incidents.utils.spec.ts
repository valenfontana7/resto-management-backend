import {
  buildOrderIncidentSummary,
  mergeRecentCriticalIncidents,
  resolveOrderIncidentKind,
  sumCriticalIncidentBreakdown,
} from './critical-incidents.utils';

describe('critical-incidents.utils', () => {
  it('suma el breakdown de incidencias', () => {
    expect(
      sumCriticalIncidentBreakdown({
        paymentFailed: 2,
        paymentRefunded: 1,
        orderCancelledPaid: 3,
        fiscalRejected: 1,
        checkoutFailed: 0,
        menuAutoDisabled: 2,
      }),
    ).toBe(9);
  });

  it('ordena y limita incidencias recientes', () => {
    const merged = mergeRecentCriticalIncidents(
      [
        {
          id: 'a',
          kind: 'payment_failed',
          label: 'Pago fallido',
          summary: 'Pedido 1',
          occurredAt: '2026-07-01T10:00:00.000Z',
          restaurantId: 'r1',
          restaurantName: 'A',
          restaurantSlug: 'a',
        },
        {
          id: 'b',
          kind: 'fiscal_rejected',
          label: 'Factura rechazada',
          summary: 'Factura B',
          occurredAt: '2026-07-02T10:00:00.000Z',
          restaurantId: 'r2',
          restaurantName: 'B',
          restaurantSlug: 'b',
        },
      ],
      1,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('b');
  });

  it('resuelve tipo de incidencia por pedido', () => {
    expect(
      resolveOrderIncidentKind({ paymentStatus: 'FAILED', status: 'PENDING' }),
    ).toBe('payment_failed');
    expect(
      resolveOrderIncidentKind({ paymentStatus: 'REFUNDED', status: 'PAID' }),
    ).toBe('payment_refunded');
    expect(
      resolveOrderIncidentKind({ paymentStatus: 'PAID', status: 'CANCELLED' }),
    ).toBe('order_cancelled_paid');
  });

  it('arma resumen legible del pedido', () => {
    expect(
      buildOrderIncidentSummary({
        orderNumber: 'ORD-12',
        paymentStatus: 'FAILED',
        status: 'PENDING',
        total: 150000,
      }),
    ).toContain('ORD-12');
    expect(
      buildOrderIncidentSummary({
        orderNumber: 'ORD-99',
        paymentStatus: 'PAID',
        status: 'CANCELLED',
        total: 50000,
      }),
    ).toContain('cancelado tras cobro');
  });
});
