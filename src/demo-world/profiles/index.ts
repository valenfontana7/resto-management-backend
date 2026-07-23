import type { FlagshipDemoSlug, StoryProfile } from '../types';
import { laParrillaProfile } from './la-parrilla';
import { cafeCentralProfile } from './cafe-central';
import { burgerLabProfile } from './burger-lab';
import { pizzaArtesanalProfile } from './pizza-artesanal';
import { sushiExpressProfile } from './sushi-express';

export const FLAGSHIP_PROFILES: Record<FlagshipDemoSlug, StoryProfile> = {
  'la-parrilla': laParrillaProfile,
  'cafe-central': cafeCentralProfile,
  'burger-lab': burgerLabProfile,
  'pizza-artesanal': pizzaArtesanalProfile,
  'sushi-express': sushiExpressProfile,
};

export function getFlagshipProfile(slug: FlagshipDemoSlug): StoryProfile {
  return FLAGSHIP_PROFILES[slug];
}

export function listFlagshipProfiles(): StoryProfile[] {
  return Object.values(FLAGSHIP_PROFILES).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

export {
  laParrillaProfile,
  cafeCentralProfile,
  burgerLabProfile,
  pizzaArtesanalProfile,
  sushiExpressProfile,
};
