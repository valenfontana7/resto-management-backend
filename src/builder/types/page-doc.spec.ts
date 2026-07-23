import {
  BUILDER_DOC_VERSION_V2,
  addHomeBlock,
  buildDefaultHomeBlocks,
  duplicateHomeBlock,
  ensureBuilderDocumentV2,
  extractPublishBranding,
  migrateV1ToV2,
  reorderHomeBlocks,
  updateBlockProps,
  validatePageDocument,
} from './page-doc';

describe('page-doc v2', () => {
  const v1Config = {
    version: '1.0.0',
    lastModified: '2026-01-01T00:00:00.000Z',
    theme: { colors: { primary: '#112233' } },
    layout: { showHeroSection: true, maxWidth: 'xl' },
    assets: {},
    sections: {
      nav: { showSection: true },
      hero: { showSection: true, title: { text: 'Hola' } },
      menu: { showSection: true },
      info: { showSection: true },
      footer: { showSection: true },
      cart: { style: 'drawer' },
      featured: { showSection: true, title: { text: 'Favoritos' } },
    },
    seo: { title: 'SEO' },
    metadata: { notes: 'x' },
    restaurant: { name: 'Draft' },
  };

  it('migrates v1 to v2 with ordered home blocks', () => {
    const v2 = migrateV1ToV2(v1Config);
    expect(v2.version).toBe(BUILDER_DOC_VERSION_V2);
    expect(v2.pages.home.blocks.map((b: { type: string }) => b.type)).toEqual([
      'hero',
      'featured',
      'menu',
      'info',
    ]);
    expect(v2.sections.hero.title.text).toBe('Hola');
    expect(v2.sections.featured.showSection).toBe(true);
  });

  it('ensureBuilderDocumentV2 is idempotent', () => {
    const once = ensureBuilderDocumentV2(v1Config);
    const twice = ensureBuilderDocumentV2(once);
    expect(twice.pages.home.blocks.length).toBe(once.pages.home.blocks.length);
    expect(twice.version).toBe(BUILDER_DOC_VERSION_V2);
  });

  it('reorders home blocks and syncs sections visibility', () => {
    const v2 = ensureBuilderDocumentV2(v1Config);
    const ids = v2.pages.home.blocks.map((b: { id: string }) => b.id);
    const reversed = [...ids].reverse();
    const next = reorderHomeBlocks(v2, reversed);
    expect(next.pages.home.blocks.map((b: { id: string }) => b.id)).toEqual(
      reversed,
    );
  });

  it('adds catalog blocks and rejects duplicate unique types', () => {
    const v2 = ensureBuilderDocumentV2(v1Config);
    const withCta = addHomeBlock(v2, 'cta');
    const cta = withCta.pages.home.blocks.find(
      (b: { type: string }) => b.type === 'cta',
    );
    expect(cta).toBeDefined();
    expect(cta?.props?.buttonText).toBe('Ver menú');
    // Multi-instance props live on the block, not sections
    expect(withCta.sections.cta).toBeUndefined();
    expect(() => addHomeBlock(withCta, 'hero')).toThrow(/ya existe/i);
  });

  it('keeps independent props when duplicating multi-instance blocks', () => {
    let doc = addHomeBlock(ensureBuilderDocumentV2(v1Config), 'cta');
    const firstId = doc.pages.home.blocks.find(
      (b: { type: string }) => b.type === 'cta',
    ).id;
    doc = updateBlockProps(doc, firstId, {
      title: { text: 'CTA A' },
      buttonText: 'A',
    });
    doc = duplicateHomeBlock(doc, firstId);
    const ctas = doc.pages.home.blocks.filter(
      (b: { type: string }) => b.type === 'cta',
    );
    expect(ctas).toHaveLength(2);
    doc = updateBlockProps(doc, ctas[1].id, {
      title: { text: 'CTA B' },
      buttonText: 'B',
    });
    const again = ensureBuilderDocumentV2(doc);
    const [a, b] = again.pages.home.blocks.filter(
      (x: { type: string }) => x.type === 'cta',
    );
    expect(a.props.title.text).toBe('CTA A');
    expect(b.props.title.text).toBe('CTA B');
  });

  it('extractPublishBranding strips builder-only fields', () => {
    const branding = extractPublishBranding(v1Config);
    expect(branding.restaurant).toBeUndefined();
    expect(branding.seo).toBeUndefined();
    expect(branding.metadata).toBeUndefined();
    expect(branding.version).toBeUndefined();
    expect(branding.pages).toBeDefined();
    expect(branding.sections).toBeDefined();
  });

  it('validatePageDocument catches duplicate unique types', () => {
    const v2 = ensureBuilderDocumentV2(v1Config);
    v2.pages.home.blocks.push({
      id: 'dup',
      type: 'hero',
      visible: true,
      props: {},
    });
    const issues = validatePageDocument(v2);
    expect(issues.some((i) => i.message.includes('at most once'))).toBe(true);
  });

  it('buildDefaultHomeBlocks skips missing optional sections', () => {
    const blocks = buildDefaultHomeBlocks({
      hero: { showSection: true },
      menu: { showSection: true },
      info: { showSection: false },
    });
    expect(blocks.map((b) => b.type)).toEqual(['hero', 'menu', 'info']);
    expect(blocks.find((b) => b.type === 'info')?.visible).toBe(false);
  });
});
