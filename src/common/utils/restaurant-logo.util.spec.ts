import { resolveRestaurantLogo } from './restaurant-logo.util';

describe('resolveRestaurantLogo', () => {
  it('prioriza la columna logo', () => {
    expect(
      resolveRestaurantLogo({
        logo: 'restaurants/a/logo/a.webp',
        branding: { assets: { logo: 'restaurants/a/logo/b.webp' } },
      }),
    ).toBe('restaurants/a/logo/a.webp');
  });

  it('usa branding.assets.logo como fallback', () => {
    expect(
      resolveRestaurantLogo({
        branding: { assets: { logo: 'restaurants/a/logo/b.webp' } },
      }),
    ).toBe('restaurants/a/logo/b.webp');
  });
});
