import {
  buildGrowthActions,
  buildMenuRecommendations,
  clampScore,
  computeOperationalScore,
  countPendingActionableOrders,
  countStuckKitchenOrders,
  marginPercent,
} from './business-health.utils';

describe('business-health.utils', () => {
  it('calcula margen bruto', () => {
    expect(marginPercent(1000, 400)).toBe(60);
    expect(marginPercent(1000, null)).toBeNull();
  });

  it('penaliza operación con mesas abiertas y pedidos estancados', () => {
    const healthy = computeOperationalScore({
      openTableSessions: 0,
      cashRegisterOpen: true,
      pendingActionableOrders: 0,
      stuckKitchenOrders: 0,
    });
    const stressed = computeOperationalScore({
      openTableSessions: 6,
      cashRegisterOpen: false,
      pendingActionableOrders: 4,
      stuckKitchenOrders: 3,
    });
    expect(healthy).toBeGreaterThan(stressed);
    expect(clampScore(150)).toBe(100);
  });

  it('sugiere promover platos rentables con baja demanda', () => {
    const recs = buildMenuRecommendations([
      {
        dishId: '1',
        name: 'Ensalada César',
        marginPercent: 55,
        unitsSold: 2,
        hasCost: true,
      },
    ]);
    expect(recs.some((r) => r.id === 'promote-1')).toBe(true);
  });

  it('sugiere acciones de crecimiento accionables', () => {
    const actions = buildGrowthActions({
      onlineShare: 10,
      inactiveCustomers: [{ name: 'Ana', daysInactive: 45 }],
      dishesWithoutCost: 3,
      lowStockCount: 1,
    });
    expect(actions.some((a) => a.id === 'direct-channel')).toBe(true);
    expect(actions.some((a) => a.id === 'win-back')).toBe(true);
    expect(actions.some((a) => a.id === 'complete-costs')).toBe(true);
    expect(actions.some((a) => a.id === 'restock')).toBe(true);
  });

  it('cuenta pedidos accionables y estancados en cocina', () => {
    const old = new Date(Date.now() - 30 * 60_000);
    expect(
      countPendingActionableOrders([
        { status: 'PENDING' },
        { status: 'DELIVERED' },
      ]),
    ).toBe(1);
    expect(
      countStuckKitchenOrders([
        { status: 'PREPARING', createdAt: old },
        { status: 'READY', createdAt: old },
      ]),
    ).toBe(1);
  });
});
