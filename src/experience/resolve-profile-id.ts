import type {
  ExperienceBuilderInput,
  ExperienceInferenceTrace,
  OperationalExperienceProfileId,
} from './experience.types';
import { EXPERIENCE_PRESETS } from './presets';

const DEFAULT_PROFILE: OperationalExperienceProfileId = 'restaurant-standard';

function scorePreset(
  presetId: OperationalExperienceProfileId,
  input: ExperienceBuilderInput,
): { score: number; signals: string[] } {
  const preset = EXPERIENCE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { score: 0, signals: [] };

  const { match } = preset;
  let score = match.weight ?? 1;
  const signals: string[] = [];

  const features = input.enabledModules.features;
  const profile = input.operationalProfile;
  const model = profile?.operationalModel;
  const focusAreas = profile?.focusAreas ?? [];

  if (match.operationalModels?.length && model) {
    if (match.operationalModels.includes(model)) {
      score += 5;
      signals.push(`model:${model}`);
    } else {
      score -= 3;
    }
  }

  if (match.requiredFeatures) {
    for (const [key, expected] of Object.entries(match.requiredFeatures)) {
      const actual = Boolean(features[key]);
      if (actual === expected) {
        score += 4;
        signals.push(`feature:${key}=${String(expected)}`);
      } else if (expected === true && !actual) {
        score -= 6;
      }
    }
  }

  if (match.focusAreas?.length) {
    const overlap = match.focusAreas.filter((fa) => focusAreas.includes(fa));
    if (overlap.length > 0) {
      score += overlap.length * 3;
      signals.push(`focus:${overlap.join(',')}`);
    }
  }

  if (match.planFeatures?.length) {
    const planFeatures = input.subscriptionPlan.features;
    const hasAll = match.planFeatures.every((f) => planFeatures[f] === true);
    if (hasAll) {
      score += match.planFeatures.length * 4;
      signals.push(`plan:${match.planFeatures.join(',')}`);
    } else {
      score -= 8;
    }
  }

  if (match.minBranchCount !== undefined) {
    if (input.tenantConfig.branchCount >= match.minBranchCount) {
      score += 10;
      signals.push(`branches:${input.tenantConfig.branchCount}`);
    } else {
      score -= 10;
    }
  }

  if (match.requiresFranchise) {
    if (input.tenantConfig.isFranchise) {
      score += 12;
      signals.push('franchise:true');
    } else {
      score -= 15;
    }
  }

  return { score, signals };
}

function inferProfileId(
  input: ExperienceBuilderInput,
): ExperienceInferenceTrace {
  const scoreByProfile: Partial<
    Record<OperationalExperienceProfileId, number>
  > = {};
  const allSignals: string[] = [];

  for (const preset of EXPERIENCE_PRESETS) {
    const { score, signals } = scorePreset(preset.id, input);
    scoreByProfile[preset.id] = score;
    if (score > 0) allSignals.push(...signals.map((s) => `${preset.id}:${s}`));
  }

  let bestId = DEFAULT_PROFILE;
  let bestScore = -Infinity;

  for (const preset of EXPERIENCE_PRESETS) {
    const score = scoreByProfile[preset.id] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestId = preset.id;
    }
  }

  // Refinements by strong signals (post-score)
  if (
    input.enabledModules.features.delivery &&
    (scoreByProfile['delivery-first'] ?? 0) >= 10
  ) {
    bestId = 'delivery-first';
  }

  if (
    input.subscriptionPlan.features.multi_location &&
    input.tenantConfig.branchCount >= 2 &&
    (scoreByProfile['multi-branch'] ?? 0) > 0
  ) {
    bestId = 'multi-branch';
  }

  if (
    input.tenantConfig.isFranchise &&
    input.subscriptionPlan.features.multi_location &&
    (scoreByProfile['franchise-enterprise'] ?? 0) > 0
  ) {
    bestId = 'franchise-enterprise';
  }

  // Full service over restaurant-standard when salon+tables
  if (
    input.enabledModules.features.salon &&
    input.enabledModules.features.tables &&
    (scoreByProfile['full-service'] ?? 0) >=
      (scoreByProfile['restaurant-standard'] ?? 0) &&
    bestId !== 'multi-branch' &&
    bestId !== 'franchise-enterprise' &&
    bestId !== 'delivery-first'
  ) {
    bestId = 'full-service';
  }

  return {
    profileId: bestId,
    source: 'inferred',
    scoreByProfile,
    signals: allSignals,
  };
}

export function resolveProfileId(
  input: ExperienceBuilderInput,
): ExperienceInferenceTrace {
  if (input.experienceProfileOverride) {
    return {
      profileId: input.experienceProfileOverride,
      source: 'override',
      scoreByProfile: { [input.experienceProfileOverride]: 999 },
      signals: ['override:manual'],
    };
  }

  return inferProfileId(input);
}
