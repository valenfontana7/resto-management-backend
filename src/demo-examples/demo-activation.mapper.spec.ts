import { describe, expect, it } from '@jest/globals';
import {
  buildSuggestedRestaurantSlug,
  mapDemoMenuCategories,
  parseDemoPayloadHours,
  remapFeaturedDishIds,
} from './demo-activation.mapper';

describe('demo-activation.mapper', () => {
  it('parses closed sunday hours from demo payload', () => {
    const hours = parseDemoPayloadHours({
      monday: '12:00-15:30, 18:30-22:30',
      sunday: 'Cerrado',
    });

    expect(hours.monday.isOpen).toBe(true);
    expect(hours.monday.timeRanges).toHaveLength(2);
    expect(hours.sunday.isOpen).toBe(false);
  });

  it('maps menu categories for onboarding seed', () => {
    const categories = mapDemoMenuCategories([
      { id: 'cat-1', name: 'Entradas', description: 'Para compartir' },
    ]);

    expect(categories).toEqual([
      { id: 'cat-1', name: 'Entradas', description: 'Para compartir' },
    ]);
  });

  it('builds suggested slug distinct from demo slug', () => {
    const slug = buildSuggestedRestaurantSlug('Fa Song Song', 'fa-song-song');
    expect(slug).not.toBe('fa-song-song');
    expect(slug.startsWith('fa-song-song-')).toBe(true);
  });

  it('remaps featured dish ids after clone', () => {
    const map = new Map<string, string>([['demo-dish', 'real-dish-id']]);
    const next = remapFeaturedDishIds(
      {
        sections: {
          featured: {
            dishIds: ['demo-dish', 'missing'],
          },
        },
      },
      map,
    );

    const featured = (next.sections as { featured: { dishIds: string[] } })
      .featured;
    expect(featured.dishIds).toEqual(['real-dish-id', 'missing']);
  });
});
