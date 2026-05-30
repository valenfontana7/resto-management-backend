import { normalizeRestaurantDraftPayload } from './restaurant-draft.util';

describe('normalizeRestaurantDraftPayload', () => {
  it('prefers businessInfo.name over a stale root name', () => {
    const draft = normalizeRestaurantDraftPayload({
      name: 'Nombre viejo',
      businessInfo: {
        name: 'Nombre nuevo',
      },
    });

    expect(draft).toMatchObject({ name: 'Nombre nuevo' });
  });

  it('prefers businessInfo.cuisineTypes over stale root cuisineTypes', () => {
    const draft = normalizeRestaurantDraftPayload({
      cuisineTypes: ['Vieja'],
      businessInfo: {
        cuisineTypes: ['Nueva', 'Autor'],
      },
    });

    expect(draft).toMatchObject({ cuisineTypes: ['Nueva', 'Autor'] });
  });

  it('keeps an intentionally empty businessInfo.cuisineTypes array', () => {
    const draft = normalizeRestaurantDraftPayload({
      cuisineTypes: ['Vieja'],
      businessInfo: {
        cuisineTypes: [],
      },
    });

    expect(draft).toMatchObject({ cuisineTypes: [] });
  });
});
