import { BundleValidationError, ProspectImporter } from '../importer';
import { ImportLogger } from '../logger';
import { isRollbackError } from '../rollback';
import { buildTestBundle, createPrismaMock } from './fixtures';
import { BundleProduct, BundleMediaImage } from '../types';

describe('prospect-importer pipeline', () => {
  it('importa un bundle válido y genera el reporte', async () => {
    const { prisma, state } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const report = await importer.importBundle(buildTestBundle(), {
      frontendUrl: 'https://bentoo.com.ar',
    });

    expect(report.success).toBe(true);
    expect(report.created).toBe(true);
    expect(report.restaurantId).toBe('db-1');
    expect(report.slug).toBe('test-resto');
    expect(report.counts.products).toBe(3);
    expect(report.urls.demo).toBe('https://bentoo.com.ar/demo/test-resto');
    expect(state.calls).toContain('$transaction');
    expect(state.rows.has('test-resto')).toBe(true);
  });

  it('rechaza bundles inválidos sin tocar la base', async () => {
    const { prisma, state } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const bundle = buildTestBundle();
    bundle.menu.products[0].category = 'cat-fantasma';

    await expect(importer.importBundle(bundle)).rejects.toThrow(
      BundleValidationError,
    );
    expect(state.calls).not.toContain('$transaction');
    expect(state.rows.size).toBe(0);
  });

  it('es idempotente: reimportar el mismo bundle actualiza en vez de duplicar', async () => {
    const { prisma, state } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const first = await importer.importBundle(buildTestBundle());
    const second = await importer.importBundle(buildTestBundle());

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.restaurantId).toBe(first.restaurantId);
    expect(state.rows.size).toBe(1);
    expect(state.calls.filter((c) => c === 'create')).toHaveLength(1);
    expect(state.calls.filter((c) => c === 'update')).toHaveLength(1);
  });

  it('el reimport conserva el sortOrder ajustado manualmente', async () => {
    const { prisma, state } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    await importer.importBundle(buildTestBundle());
    state.rows.get('test-resto')!.sortOrder = 42;

    await importer.importBundle(buildTestBundle());
    expect(state.rows.get('test-resto')!.sortOrder).toBe(42);
  });

  it('hace rollback completo si la persistencia falla a mitad de camino', async () => {
    const { prisma, state } = createPrismaMock({ failOn: 'create' });
    const importer = new ProspectImporter(prisma);

    let caught: unknown;
    try {
      await importer.importBundle(buildTestBundle());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(isRollbackError(caught)).toBe(true);
    expect(state.rows.size).toBe(0);
  });

  it('dry run valida y mapea sin persistir', async () => {
    const { prisma, state } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const report = await importer.importBundle(buildTestBundle(), {
      dryRun: true,
    });

    expect(report.restaurantId).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it('propaga warnings de validación y mapeo al reporte', async () => {
    const { prisma } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const bundle = buildTestBundle();
    bundle.prospect.neighborhood = '';
    bundle.business.category = 'food-hall';

    const report = await importer.importBundle(bundle);
    expect(report.warnings.some((w) => w.includes('neighborhood'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('food-hall'))).toBe(true);
  });

  it('emite logs estructurados por paso', async () => {
    const { prisma } = createPrismaMock();
    const logger = new ImportLogger();
    const importer = new ProspectImporter(prisma, logger);

    await importer.importBundle(buildTestBundle());

    const steps = logger.getSteps().map((s) => s.step);
    expect(steps).toEqual(
      expect.arrayContaining(['validate', 'map', 'persist']),
    );
    const events = logger.getEvents();
    expect(events.some((e) => e.message === 'validate started')).toBe(true);
    expect(events.some((e) => e.message === 'persist finished')).toBe(true);
  });

  it('soporta menús grandes (60 categorías, 600 productos, 600 imágenes)', async () => {
    const bundle = buildTestBundle();

    const categories = Array.from({ length: 60 }, (_, i) => ({
      id: `cat-big-${i}`,
      name: `Categoría ${i}`,
      order: i + 10,
    }));

    const images: BundleMediaImage[] = Array.from({ length: 600 }, (_, i) => ({
      id: `media-big-${i}`,
      type: 'dish',
      source: 'GENERATED' as const,
      filename: `dish-${i}.jpg`,
      alt: `Plato ${i}`,
      priority: 'medium',
      prompt: `prompt ${i}`,
    }));

    const products: BundleProduct[] = Array.from({ length: 600 }, (_, i) => ({
      id: `p-big-${i}`,
      name: `Plato ${i}`,
      description: `Descripción del plato ${i}`,
      price: 1000 + i,
      category: `cat-big-${i % 60}`,
      imageReference: `media-big-${i}`,
    }));

    bundle.menu.categories.push(...categories);
    bundle.menu.products.push(...products);
    bundle.media.images.push(...images);

    const { prisma } = createPrismaMock();
    const importer = new ProspectImporter(prisma);

    const startedAt = Date.now();
    const report = await importer.importBundle(bundle);
    const elapsed = Date.now() - startedAt;

    expect(report.counts.products).toBe(603);
    expect(report.counts.categories).toBe(62);
    expect(report.counts.images).toBe(604);
    expect(elapsed).toBeLessThan(5000);
  });
});
