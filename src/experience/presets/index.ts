import type {
  ExperiencePreset,
  OperationalExperienceProfileId,
} from '../experience.types';
import { digitalOnlyPreset } from './digital-only.preset';
import { deliveryFirstPreset } from './delivery-first.preset';
import { franchiseEnterprisePreset } from './franchise-enterprise.preset';
import { fullServicePreset } from './full-service.preset';
import { multiBranchPreset } from './multi-branch.preset';
import { restaurantStandardPreset } from './restaurant-standard.preset';
import { mergePreset } from './preset-shared';

const RAW_PRESETS: ExperiencePreset[] = [
  digitalOnlyPreset,
  deliveryFirstPreset,
  restaurantStandardPreset,
  fullServicePreset,
  multiBranchPreset,
  franchiseEnterprisePreset,
];

function resolvePresetInheritance(preset: ExperiencePreset): ExperiencePreset {
  if (!preset.extends) return preset;
  const parent = RAW_PRESETS.find((p) => p.id === preset.extends);
  if (!parent) return preset;
  const resolvedParent = resolvePresetInheritance(parent);
  return mergePreset(resolvedParent, preset);
}

export const EXPERIENCE_PRESETS: ExperiencePreset[] = RAW_PRESETS.map(
  resolvePresetInheritance,
);

export const EXPERIENCE_PRESET_BY_ID = new Map<
  OperationalExperienceProfileId,
  ExperiencePreset
>(EXPERIENCE_PRESETS.map((preset) => [preset.id, preset]));

export function getExperiencePreset(
  id: OperationalExperienceProfileId,
): ExperiencePreset | undefined {
  return EXPERIENCE_PRESET_BY_ID.get(id);
}

export function listExperiencePresetSummaries() {
  return EXPERIENCE_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
  }));
}
