export type ActivationPath = 'digital' | 'salon';
export type ActivationOperationalModel = 'digital' | 'salon' | 'mixed';
export type ActivationScoreBand =
  | 'cold'
  | 'warming'
  | 'activated'
  | 'confident';

export type ActivationMilestoneId =
  | 'channel_live'
  | 'guided_ops_proof'
  | 'real_menu_item'
  | 'real_ops_action'
  | 'team_joined'
  | 'second_session';

export type ActivationMilestones = Partial<
  Record<ActivationMilestoneId, string>
>;

const WEIGHTS: Record<
  ActivationOperationalModel,
  Record<ActivationMilestoneId, number>
> = {
  digital: {
    channel_live: 35,
    guided_ops_proof: 15,
    real_menu_item: 15,
    real_ops_action: 20,
    team_joined: 10,
    second_session: 5,
  },
  salon: {
    channel_live: 10,
    guided_ops_proof: 35,
    real_menu_item: 15,
    real_ops_action: 25,
    team_joined: 10,
    second_session: 5,
  },
  mixed: {
    channel_live: 25,
    guided_ops_proof: 20,
    real_menu_item: 15,
    real_ops_action: 20,
    team_joined: 10,
    second_session: 10,
  },
};

const MILESTONE_COPY: Record<
  ActivationMilestoneId,
  { title: string; benefit: string; href: string }
> = {
  channel_live: {
    title: 'Publicá y compartí tu canal',
    benefit: 'Para que te pidan a vos, sin intermediarios.',
    href: '/admin/builder',
  },
  guided_ops_proof: {
    title: 'Probá un cobro en salón',
    benefit: 'Vas a sentir cómo opera Bentoo en el turno.',
    href: '/admin/salon',
  },
  real_menu_item: {
    title: 'Cargá un plato real',
    benefit: 'Tu carta deja de ser de ejemplo.',
    href: '/admin/menu',
  },
  real_ops_action: {
    title: 'Hacé un cobro o pedido real',
    benefit: 'Ahí Bentoo empieza a trabajar de verdad.',
    href: '/admin/operacion',
  },
  team_joined: {
    title: 'Invitá a alguien del equipo',
    benefit: 'Dejá de operar solo en la hora pico.',
    href: '/admin/go-live',
  },
  second_session: {
    title: 'Volvé mañana a mirar el turno',
    benefit: 'El hábito es lo que convierte a Bentoo en sistema.',
    href: '/admin',
  },
};

export function mapProductIntentToModel(
  intent?: string | null,
): ActivationOperationalModel {
  if (intent === 'digital') return 'digital';
  if (intent === 'operations') return 'salon';
  return 'mixed';
}

export function bandForScore(score: number): ActivationScoreBand {
  if (score >= 80) return 'confident';
  if (score >= 60) return 'activated';
  if (score >= 30) return 'warming';
  return 'cold';
}

export function computeActivationScore(
  model: ActivationOperationalModel,
  milestones: ActivationMilestones,
): { score: number; band: ActivationScoreBand } {
  const weights = WEIGHTS[model];
  let score = 0;
  for (const id of Object.keys(weights) as ActivationMilestoneId[]) {
    if (milestones[id]) score += weights[id];
  }
  score = Math.min(100, score);
  return { score, band: bandForScore(score) };
}

export type NextMilestone = {
  id: ActivationMilestoneId;
  title: string;
  benefit: string;
  href: string;
  weight: number;
};

export function resolveNextMilestone(
  model: ActivationOperationalModel,
  milestones: ActivationMilestones,
): NextMilestone | null {
  const weights = WEIGHTS[model];
  let best: NextMilestone | null = null;
  for (const id of Object.keys(weights) as ActivationMilestoneId[]) {
    if (milestones[id]) continue;
    const weight = weights[id];
    if (!best || weight > best.weight) {
      const copy = MILESTONE_COPY[id];
      best = { id, weight, ...copy };
    }
  }
  return best;
}

export function inferMilestonesFromSignals(input: {
  firstValueType?: string | null;
  isPublished?: boolean;
  realDishCount?: number;
  realOpsCount?: number;
  teamMemberCount?: number;
  secondSessionAt?: string | null;
  existing?: ActivationMilestones;
}): ActivationMilestones {
  const now = new Date().toISOString();
  const m: ActivationMilestones = { ...(input.existing ?? {}) };

  if (
    input.firstValueType === 'digital_publish' ||
    (input.isPublished && !m.channel_live)
  ) {
    m.channel_live = m.channel_live ?? now;
  }
  if (input.firstValueType === 'salon_test_charge') {
    m.guided_ops_proof = m.guided_ops_proof ?? now;
  }
  if ((input.realDishCount ?? 0) > 0) {
    m.real_menu_item = m.real_menu_item ?? now;
  }
  if ((input.realOpsCount ?? 0) > 0) {
    m.real_ops_action = m.real_ops_action ?? now;
  }
  if ((input.teamMemberCount ?? 0) >= 2) {
    m.team_joined = m.team_joined ?? now;
  }
  if (input.secondSessionAt) {
    m.second_session = m.second_session ?? input.secondSessionAt;
  }
  return m;
}
