import { describe, expect, it } from '@jest/globals';
import {
  buildBuilderDraftFromPayload,
  buildSuggestedRestaurantSlug,
  extractDemoMenu,
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

  it('extracts nested dishes from prospect-style menu payload', () => {
    const menu = extractDemoMenu([
      {
        id: 'cat-1',
        name: 'Cafés',
        dishes: [
          { id: 'd1', name: 'Latte', price: 10, isFeatured: true },
          { name: 'Sin id', price: 'bad' },
        ],
      },
      { name: '' },
      null,
    ]);

    expect(menu).toHaveLength(1);
    expect(menu[0].dishes).toHaveLength(2);
    expect(menu[0].dishes?.[0]).toMatchObject({
      id: 'd1',
      name: 'Latte',
      price: 10,
      isFeatured: true,
    });
    expect(menu[0].dishes?.[1].price).toBeUndefined();
  });

  it('builds builder draft from branding and seo when no builderConfig', () => {
    const draft = buildBuilderDraftFromPayload({
      branding: {
        theme: { primary: '#111' },
        assets: { coverImage: 'cover.webp' },
      },
      seo: { title: 'Mi resto', description: 'Demo' },
    });

    expect(draft.theme).toEqual({ primary: '#111' });
    expect(draft.seo).toMatchObject({
      title: 'Mi resto',
      description: 'Demo',
      ogImage: 'cover.webp',
    });
  });
});
