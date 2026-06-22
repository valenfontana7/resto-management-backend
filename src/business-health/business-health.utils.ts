export const KITCHEN_STUCK_MINUTES = 20;
export const LOW_MARGIN_THRESHOLD = 25;
export const HIGH_MARGIN_THRESHOLD = 40;
export const DIRECT_CHANNEL_TARGET = 35;

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function marginPercent(
  salePrice: number,
  costPrice: number | null,
): number | null {
  if (costPrice == null || salePrice <= 0) return null;
  return Math.round(((salePrice - costPrice) / salePrice) * 1000) / 10;
}

export function computeOperationalScore(input: {
  openTableSessions: number;
  cashRegisterOpen: boolean;
  pendingActionableOrders: number;
  stuckKitchenOrders: number;
}): number {
  let score = 100;
  score -= input.openTableSessions > 5 ? 15 : input.openTableSessions * 2;
  if (!input.cashRegisterOpen) score -= 10;
  score -= Math.min(input.pendingActionableOrders * 3, 15);
  score -= Math.min(input.stuckKitchenOrders * 5, 20);
  return clampScore(score);
}

export function computeCommercialScore(
  totalOrders: number,
  onlineSharePercent: number,
): number {
  return clampScore(
    (totalOrders > 0 ? 50 : 10) + Math.min(onlineSharePercent, 50),
  );
}

export function computeMarginScore(
  totalDishes: number,
  dishesWithCost: number,
  averageMarginPercent: number | null,
): number {
  if (totalDishes === 0) return 0;
  return clampScore(
    (dishesWithCost / totalDishes) * 60 +
      (averageMarginPercent != null ? Math.min(averageMarginPercent, 40) : 0),
  );
}

export interface MenuRecommendation {
  id: string;
  type: 'promote' | 'review' | 'setup';
  title: string;
  detail: string;
  href: string;
}

export function buildMenuRecommendations(
  dishes: Array<{
    dishId: string;
    name: string;
    marginPercent: number | null;
    unitsSold: number;
    hasCost: boolean;
  }>,
): MenuRecommendation[] {
  const withData = dishes.filter((d) => d.hasCost && d.marginPercent != null);
  if (withData.length === 0) {
    return [
      {
        id: 'add-costs',
        type: 'setup',
        title: 'Cargá costos en el menú',
        detail:
          'Agregá el costo estimado en cada plato para ver margen y recomendaciones.',
        href: '/admin/menu',
      },
    ];
  }

  const recommendations: MenuRecommendation[] = [];

  const promote = [...withData]
    .filter(
      (d) =>
        (d.marginPercent ?? 0) >= HIGH_MARGIN_THRESHOLD && d.unitsSold <= 3,
    )
    .slice(0, 2);
  for (const dish of promote) {
    recommendations.push({
      id: `promote-${dish.dishId}`,
      type: 'promote',
      title: `Promocionar "${dish.name}"`,
      detail: `Margen ${dish.marginPercent}% pero pocas ventas (${dish.unitsSold} u.) — ideal para empujar en QR/link.`,
      href: '/admin/menu',
    });
  }

  const review = [...withData]
    .filter(
      (d) =>
        (d.marginPercent ?? 100) < LOW_MARGIN_THRESHOLD && d.unitsSold >= 5,
    )
    .slice(0, 2);
  for (const dish of review) {
    recommendations.push({
      id: `review-${dish.dishId}`,
      type: 'review',
      title: `Revisar margen de "${dish.name}"`,
      detail: `Margen ${dish.marginPercent}% con ${dish.unitsSold} ventas — evaluá precio o costo.`,
      href: '/admin/menu',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'balanced',
      type: 'setup',
      title: 'Menú equilibrado',
      detail: 'No hay alertas fuertes de margen vs demanda en este período.',
      href: '/admin/analytics',
    });
  }

  return recommendations;
}

export interface GrowthAction {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
}

export function buildGrowthActions(input: {
  onlineShare: number;
  inactiveCustomers: Array<{ name: string; daysInactive: number }>;
  dishesWithoutCost: number;
  lowStockCount: number;
}): GrowthAction[] {
  const actions: GrowthAction[] = [];

  if (input.onlineShare < DIRECT_CHANNEL_TARGET) {
    actions.push({
      id: 'direct-channel',
      title: 'Empujar canal directo',
      detail: `Solo ${input.onlineShare}% de ingresos viene del link/QR. Compartí tu menú y evitá comisiones de apps.`,
      href: '/admin/builder',
      priority: 'high',
    });
  }

  if (input.inactiveCustomers.length > 0) {
    actions.push({
      id: 'win-back',
      title: `Recuperar ${input.inactiveCustomers.length} cliente(s) inactivo(s)`,
      detail:
        'Enviá un email de win-back o contactá por WhatsApp con un cupón.',
      href: '/admin/salud#clientes-inactivos',
      priority: 'medium',
    });
  }

  if (input.dishesWithoutCost > 0) {
    actions.push({
      id: 'complete-costs',
      title: `${input.dishesWithoutCost} plato(s) sin costo cargado`,
      detail: 'Completá costos para decisiones semanales de margen.',
      href: '/admin/menu',
      priority: 'medium',
    });
  }

  if (input.lowStockCount > 0) {
    actions.push({
      id: 'restock',
      title: `${input.lowStockCount} insumo(s) en quiebre`,
      detail: 'Reponé stock crítico antes de marcar platos agotados.',
      href: '/admin/salud#inventario',
      priority: 'high',
    });
  }

  return actions;
}

export function countStuckKitchenOrders(
  orders: Array<{ status: string; createdAt: Date }>,
  now = new Date(),
): number {
  const thresholdMs = KITCHEN_STUCK_MINUTES * 60_000;
  return orders.filter((order) => {
    if (!['CONFIRMED', 'PREPARING', 'PAID'].includes(order.status)) {
      return false;
    }
    return now.getTime() - order.createdAt.getTime() >= thresholdMs;
  }).length;
}

export function countPendingActionableOrders(
  orders: Array<{ status: string }>,
): number {
  return orders.filter((order) =>
    ['PENDING', 'PAID', 'CONFIRMED'].includes(order.status),
  ).length;
}
