import type { FocusArea, OperationalModel } from './operational-profile.types';

export function featuresForOperationalModel(
  model: OperationalModel,
  focusAreas: FocusArea[] = [],
): Record<string, boolean> {
  const base: Record<string, boolean> = {
    menu: true,
    orders: true,
    salon: model !== 'digital',
    tables: model !== 'digital',
    onlineOrdering: model !== 'salon',
    takeaway: model !== 'salon',
    socialMedia: model !== 'salon',
    reservations: model !== 'digital',
    delivery: false,
    loyalty: false,
    reviews: false,
  };

  if (focusAreas.includes('delivery_logistics')) {
    base.delivery = true;
  }

  if (focusAreas.includes('web_channel')) {
    base.onlineOrdering = true;
    base.takeaway = true;
    base.socialMedia = true;
  }

  if (
    focusAreas.includes('floor_service') ||
    model === 'salon' ||
    model === 'mixed'
  ) {
    base.salon = true;
    base.tables = true;
  }

  if (focusAreas.includes('reservations')) {
    base.reservations = true;
  }

  return base;
}

export function mergeFocusAreasWithFeatures(
  focusAreas: FocusArea[],
  features: Record<string, boolean>,
): FocusArea[] {
  const merged = [...focusAreas];

  if (features.delivery && !merged.includes('delivery_logistics')) {
    merged.push('delivery_logistics');
  }
  if (features.onlineOrdering && !merged.includes('web_channel')) {
    merged.push('web_channel');
  }
  if (features.salon && !merged.includes('floor_service')) {
    merged.unshift('floor_service');
  }

  return [...new Set(merged)];
}

export function channelsFromFocusAreas(focusAreas: FocusArea[]): string[] {
  const channels: string[] = [];
  if (focusAreas.includes('web_channel')) channels.push('web', 'qr');
  if (focusAreas.includes('delivery_logistics')) channels.push('delivery');
  if (focusAreas.includes('floor_service')) channels.push('salon');
  return channels;
}
