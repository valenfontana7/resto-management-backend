import { validateBundle } from '../validator';
import { parseBundle, BundleParseError } from '../parser';
import { buildTestBundle } from './fixtures';

describe('prospect-importer validator', () => {
  it('acepta un bundle válido sin errores', () => {
    const result = validateBundle(buildTestBundle());
    expect(result.errors).toEqual([]);
  });

  it('rechaza schemaVersion no soportada en el parser', () => {
    const bundle = buildTestBundle();
    const raw = JSON.stringify({ ...bundle, schemaVersion: '9.9' });
    expect(() => parseBundle(raw)).toThrow(BundleParseError);
    expect(() => parseBundle(raw)).toThrow(/9\.9/);
  });

  it('rechaza JSON inválido', () => {
    expect(() => parseBundle('{ no es json')).toThrow(BundleParseError);
  });

  it('detecta IDs duplicados entre productos, categorías y media', () => {
    const bundle = buildTestBundle();
    bundle.menu.products[1].id = bundle.menu.products[0].id;
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('ID duplicado'))).toBe(true);
  });

  it('rechaza productos con categoría inexistente', () => {
    const bundle = buildTestBundle();
    bundle.menu.products[0].category = 'cat-fantasma';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('categoría inexistente'))).toBe(
      true,
    );
  });

  it('rechaza referencias de imagen rotas en productos', () => {
    const bundle = buildTestBundle();
    bundle.menu.products[0].imageReference = 'media-inexistente';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('imagen inexistente'))).toBe(
      true,
    );
  });

  it('rechaza secciones que referencian media inexistente', () => {
    const bundle = buildTestBundle();
    bundle.sections.hero.content.backgroundImage = 'media-fantasma';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('media inexistente'))).toBe(
      true,
    );
  });

  it('rechaza CTAs con destino inválido', () => {
    const bundle = buildTestBundle();
    bundle.sections.hero.ctas![0].target = 'route:/no-existe';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('ruta no declarada'))).toBe(
      true,
    );
  });

  it('rechaza navegación rota', () => {
    const bundle = buildTestBundle();
    bundle.builder.navigation.items[0].target = 'anchor:seccion-fantasma';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('anchor inexistente'))).toBe(
      true,
    );
  });

  it('rechaza tokens de theme inválidos', () => {
    const bundle = buildTestBundle();
    bundle.theme.borderRadius = 'gigante';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('borderRadius'))).toBe(true);
  });

  it('rechaza colores inválidos', () => {
    const bundle = buildTestBundle();
    bundle.branding.colorPalette.primary = 'rojo';
    const result = validateBundle(bundle);
    expect(result.errors.some((e) => e.includes('Color inválido'))).toBe(true);
  });

  it('rechaza colorTokens del builder fuera de la paleta', () => {
    const bundle = buildTestBundle();
    bundle.builder.colorTokens = { primary: '#123456' };
    const result = validateBundle(bundle);
    expect(
      result.errors.some((e) =>
        e.includes('no existe en branding.colorPalette'),
      ),
    ).toBe(true);
  });

  it('warning (no error) por categoría vacía', () => {
    const bundle = buildTestBundle();
    bundle.menu.categories.push({ id: 'cat-vacia', name: 'Vacía', order: 3 });
    const result = validateBundle(bundle);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('cat-vacia'))).toBe(true);
  });

  it('exige prompt en imágenes generadas', () => {
    const bundle = buildTestBundle();
    bundle.media.images[1].prompt = null;
    const result = validateBundle(bundle);
    expect(
      result.errors.some((e) => e.includes('prompt de regeneración')),
    ).toBe(true);
  });
});
