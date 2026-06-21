import { normalizeAssetReference } from './asset-reference.util';

describe('normalizeAssetReference', () => {
  it('normaliza keys S3 directas', () => {
    expect(
      normalizeAssetReference('restaurants/abc/logo/1781895228876-jsq2j1.webp'),
    ).toBe('restaurants/abc/logo/1781895228876-jsq2j1.webp');
  });

  it('normaliza rutas relativas del proxy', () => {
    expect(
      normalizeAssetReference(
        '/api/uploads/restaurants/abc/logo/1781895228876-jsq2j1.webp',
      ),
    ).toBe('restaurants/abc/logo/1781895228876-jsq2j1.webp');
  });

  it('normaliza URLs absolutas del backend en dev', () => {
    expect(
      normalizeAssetReference(
        'http://localhost:4000/api/uploads/restaurants/abc/logo/1781895228876-jsq2j1.webp',
      ),
    ).toBe('restaurants/abc/logo/1781895228876-jsq2j1.webp');
  });

  it('trata como equivalentes key y URL del mismo objeto', () => {
    const key = 'restaurants/abc/logo/file.webp';
    const proxy = `/api/uploads/${key}`;

    expect(normalizeAssetReference(key)).toBe(normalizeAssetReference(proxy));
  });
});
