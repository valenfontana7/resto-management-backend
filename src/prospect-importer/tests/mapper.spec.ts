import { mapBundle, normalizeSlug } from '../mapper';
import { resolveMediaUrl } from '../importers/media';
import { buildTestBundle } from './fixtures';

describe('prospect-importer mapper', () => {
  it('mapea el bundle completo al modelo interno', () => {
    const mapped = mapBundle(buildTestBundle());

    expect(mapped.record).toMatchObject({
      slug: 'test-resto',
      name: 'Test Resto',
      type: 'restaurant',
      city: 'Buenos Aires',
      neighborhood: 'Palermo',
      isPublic: false,
      sortOrder: 9010,
    });

    expect(mapped.counts).toEqual({
      products: 3,
      categories: 2,
      sectionsActive: 6,
      images: 4,
      seoCompleted: true,
    });
  });

  it('resuelve URLs de media incluyendo rutas relativas', () => {
    expect(resolveMediaUrl('/demo/photos/leads/x/', 'foo.jpg')).toBe(
      '/demo/photos/leads/x/foo.jpg',
    );
    expect(
      resolveMediaUrl('/demo/photos/leads/x/', '../../dishes/agua.jpg'),
    ).toBe('/demo/photos/dishes/agua.jpg');
    expect(
      resolveMediaUrl(
        '/demo/photos/leads/x/',
        '/api/uploads/leads-demos/x/a.jpg',
      ),
    ).toBe('/api/uploads/leads-demos/x/a.jpg');
  });

  it('convierte openingHours al formato de horarios demo', () => {
    const mapped = mapBundle(buildTestBundle());
    const hours = (mapped.payload as { hours: Record<string, string> }).hours;
    expect(hours.friday).toBe('12:00-15:00, 19:00-23:30');
    expect(hours.sunday).toBe('Cerrado');
  });

  it('arma el menú agrupado por categoría con imágenes resueltas', () => {
    const mapped = mapBundle(buildTestBundle());
    const menu = (
      mapped.payload as { menu: Array<{ id: string; dishes: unknown[] }> }
    ).menu;

    expect(menu).toHaveLength(2);
    expect(menu[0].id).toBe('cat-pizzas');
    expect(menu[0].dishes).toHaveLength(2);

    const muzza = (
      menu[0].dishes as Array<{
        id: string;
        image: string;
        isFeatured: boolean;
      }>
    )[0];
    expect(muzza.image).toBe('/demo/photos/leads/test-resto/pizza.jpg');
    expect(muzza.isFeatured).toBe(true);
  });

  it('extrae testimonios al shape del payload demo', () => {
    const mapped = mapBundle(buildTestBundle());
    const testimonials = (
      mapped.payload as { testimonials: Array<{ customerName: string }> }
    ).testimonials;
    expect(testimonials).toEqual([
      expect.objectContaining({
        customerName: 'Ana',
        rating: 5,
        verified: true,
      }),
    ]);
  });

  it('resuelve og:image de mediaId a URL', () => {
    const mapped = mapBundle(buildTestBundle());
    const seo = (
      mapped.payload as { seo: { openGraph: Record<string, string> } }
    ).seo;
    expect(seo.openGraph['og:image']).toBe(
      '/demo/photos/leads/test-resto/hero.jpg',
    );
  });

  it('persiste el manifest de media sin descargar nada', () => {
    const mapped = mapBundle(buildTestBundle());
    const media = (
      mapped.payload as {
        media: Array<{
          id: string;
          status: string;
          replacementRequired: boolean;
          prompt: string | null;
        }>;
      }
    ).media;

    expect(media).toHaveLength(4);
    const logo = media.find((m) => m.id === 'media-logo')!;
    expect(logo.status).toBe('replacement-required');
    expect(logo.replacementRequired).toBe(true);
    expect(logo.prompt).toBe('logo prompt');
  });

  it('normaliza slugs con acentos y símbolos', () => {
    expect(normalizeSlug('Fa Sóng  Sòng!!')).toBe('fa-song-song');
  });

  it('deriva slug del businessName si builder no lo define', () => {
    const bundle = buildTestBundle();
    delete bundle.builder.bentooImport;
    const mapped = mapBundle(bundle);
    expect(mapped.record.slug).toBe('test-resto');
    expect(mapped.record.isPublic).toBe(false);
  });
});
