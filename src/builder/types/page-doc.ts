/**
 * Builder document v2 — pages + ordered typed blocks.
 * Keeps `sections` as a synced mirror so existing customer components
 * (useBranding / getSectionConfig) keep working.
 */

export const BUILDER_DOC_VERSION_V2 = '2.0.0';

export const HOME_CONTENT_BLOCK_TYPES = [
  'hero',
  'featured',
  'menu',
  'about',
  'testimonials',
  'faq',
  'info',
  'cta',
  'gallery',
  'richText',
  'hours',
  'map',
  'stack',
  'columns',
  'canvas',
] as const;

export type HomeContentBlockType = (typeof HOME_CONTENT_BLOCK_TYPES)[number];

/** Block types that may appear at most once on home. */
export const UNIQUE_HOME_BLOCK_TYPES = new Set<HomeContentBlockType>([
  'hero',
  'featured',
  'menu',
  'about',
  'testimonials',
  'faq',
  'info',
  'hours',
  'map',
]);

export const DEFAULT_HOME_BLOCK_ORDER: HomeContentBlockType[] = [
  'hero',
  'featured',
  'menu',
  'about',
  'testimonials',
  'faq',
  'info',
];

export const SHELL_SECTION_KEYS = [
  'nav',
  'footer',
  'cart',
  'checkout',
  'orderConfirmation',
  'reservations',
] as const;

export type ShellSectionKey = (typeof SHELL_SECTION_KEYS)[number];

export type ColumnsRatio = '50-50' | '60-40' | '40-60';

/** Parent types that can hold nested child blocks (page-builder v2 nesting). */
export type ContainerBlockType = 'stack' | 'columns' | 'canvas';

export const CONTAINER_BLOCK_TYPES = new Set<ContainerBlockType>([
  'stack',
  'columns',
  'canvas',
]);

/**
 * Allowed child types per container.
 * Shallow nesting: `columns` may contain `stack`; `stack`/`canvas` may not nest containers.
 * Canvas accepts every leaf block type (positioned via `props.frame` on desktop).
 */
export const CONTAINER_CHILD_ALLOWLIST: Record<
  ContainerBlockType,
  HomeContentBlockType[]
> = {
  stack: ['richText', 'cta', 'gallery', 'hours', 'map'],
  columns: ['richText', 'cta', 'gallery', 'stack'],
  // All non-container leaves — unique types still gated by canAddChildType if already on the page.
  canvas: [
    'hero',
    'featured',
    'menu',
    'about',
    'testimonials',
    'faq',
    'info',
    'cta',
    'gallery',
    'richText',
    'hours',
    'map',
  ],
};

/** Max container ancestors allowed for a nested container child (root columns → stack). */
export const MAX_NESTED_CONTAINER_DEPTH = 1;

/** Absolute frame for a child inside a `canvas` artboard (px relative to canvas). */
export type BlockFrame = {
  x: number;
  y: number;
  w?: number;
  z?: number;
};

export const CANVAS_FRAME_SNAP_PX = 8;

export type BlockInstance = {
  id: string;
  type: HomeContentBlockType;
  visible: boolean;
  props?: Record<string, unknown>;
  children?: BlockInstance[];
};

export type PageKind = 'system' | 'custom';

export type PageDoc = {
  id: string;
  kind: PageKind;
  title: string;
  /** Public path segment for custom pages only */
  slug?: string;
  blocks: BlockInstance[];
  seo?: {
    title?: string;
    description?: string;
  };
};

export type PagesMap = Record<string, PageDoc>;

export function isHomeContentBlockType(
  value: string,
): value is HomeContentBlockType {
  return (HOME_CONTENT_BLOCK_TYPES as readonly string[]).includes(value);
}

export function createBlockId(type: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `blk_${type}_${rand}`;
}

/**
 * Deterministic id for default / V1→V2 migrated unique home blocks.
 * Must not use randomUUID — public SSR and client hydration call migrate independently.
 */
export function createDefaultBlockId(type: string): string {
  return `blk_${type}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseBlockFrame(value: unknown): BlockFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null;
  const frame: BlockFrame = { x: raw.x, y: raw.y };
  if (raw.w !== undefined) {
    if (!isFiniteNumber(raw.w) || raw.w <= 0) return null;
    frame.w = raw.w;
  }
  if (raw.z !== undefined) {
    if (!isFiniteNumber(raw.z)) return null;
    frame.z = raw.z;
  }
  return frame;
}

export function getBlockFrame(block: BlockInstance): BlockFrame | null {
  return parseBlockFrame(block.props?.frame);
}

export function setBlockFrame(
  block: BlockInstance,
  frame: BlockFrame,
): BlockInstance {
  return {
    ...block,
    props: {
      ...(block.props ?? {}),
      frame: {
        x: frame.x,
        y: frame.y,
        ...(frame.w !== undefined ? { w: frame.w } : {}),
        ...(frame.z !== undefined ? { z: frame.z } : {}),
      },
    },
  };
}

export function snapCanvasCoord(
  value: number,
  grid = CANVAS_FRAME_SNAP_PX,
): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / grid) * grid;
}

export function defaultFrameForCanvasChild(
  siblingCount: number,
  type?: HomeContentBlockType,
): BlockFrame {
  const wide =
    type === 'hero' ||
    type === 'menu' ||
    type === 'featured' ||
    type === 'about' ||
    type === 'testimonials' ||
    type === 'faq' ||
    type === 'info' ||
    type === 'map';
  return {
    x: 40,
    y: 40 + siblingCount * 32,
    w: wide ? 640 : 320,
    z: siblingCount,
  };
}

function asRecord(value: unknown): Record<string, any> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return undefined;
}

function sectionVisible(
  section: Record<string, any> | undefined,
  fallback = true,
): boolean {
  if (!section) return false;
  if (section.showSection === false) return false;
  return fallback;
}

/**
 * Build default home blocks from v1 keyed sections + fixed conversion order.
 */
export function buildDefaultHomeBlocks(
  sections: Record<string, any> | undefined,
  layout?: { showHeroSection?: boolean },
): BlockInstance[] {
  const blocks: BlockInstance[] = [];

  for (const type of DEFAULT_HOME_BLOCK_ORDER) {
    const section = asRecord(sections?.[type]);
    if (type === 'hero') {
      const visible =
        layout?.showHeroSection !== false &&
        sectionVisible(section ?? { showSection: true });
      blocks.push({
        id: createDefaultBlockId('hero'),
        type: 'hero',
        visible,
        props: section ? { ...section } : { showSection: true },
      });
      continue;
    }

    // Optional composed sections: only include if present in config
    if (
      type === 'featured' ||
      type === 'about' ||
      type === 'testimonials' ||
      type === 'faq'
    ) {
      if (!section) continue;
      blocks.push({
        id: createDefaultBlockId(type),
        type,
        visible: sectionVisible(section),
        props: { ...section },
      });
      continue;
    }

    // menu / info — always present in defaults
    blocks.push({
      id: createDefaultBlockId(type),
      type,
      visible: sectionVisible(section ?? { showSection: true }),
      props: section ? { ...section } : { showSection: true },
    });
  }

  return blocks;
}

export function buildDefaultHomePage(
  sections: Record<string, any> | undefined,
  layout?: { showHeroSection?: boolean },
): PageDoc {
  return {
    id: 'home',
    kind: 'system',
    title: 'Inicio',
    blocks: buildDefaultHomeBlocks(sections, layout),
  };
}

/** Block types that may appear more than once — props live only on the block instance. */
export const MULTI_INSTANCE_BLOCK_TYPES = new Set<HomeContentBlockType>(
  HOME_CONTENT_BLOCK_TYPES.filter((t) => !UNIQUE_HOME_BLOCK_TYPES.has(t)),
);

/**
 * Mirror unique-block props/visibility into keyed `sections` for legacy customer components.
 * Multi-instance types (cta, gallery, richText) are NOT mirrored — each keeps `block.props`.
 */
export function syncSectionsFromPages(
  config: Record<string, any>,
): Record<string, any> {
  const pages = asRecord(config.pages);
  const home = pages?.home as PageDoc | undefined;
  if (!home?.blocks?.length) return config;

  const sections: Record<string, any> = {
    ...(asRecord(config.sections) ?? {}),
  };

  for (const block of home.blocks) {
    if (!isHomeContentBlockType(block.type)) continue;
    if (!UNIQUE_HOME_BLOCK_TYPES.has(block.type)) continue;
    const props = { ...(block.props ?? {}) };
    props.showSection = block.visible !== false;
    sections[block.type] = props;
  }

  // Hide unique section types that are no longer in the page
  const present = new Set(home.blocks.map((b) => b.type));
  for (const type of UNIQUE_HOME_BLOCK_TYPES) {
    if (!present.has(type) && sections[type]) {
      sections[type] = { ...sections[type], showSection: false };
    }
  }

  // Drop stale multi-instance section keys (source of truth is block.props)
  for (const type of MULTI_INSTANCE_BLOCK_TYPES) {
    if (sections[type]) {
      delete sections[type];
    }
  }

  if (sections.hero || home.blocks.some((b) => b.type === 'hero')) {
    config.layout = {
      ...(asRecord(config.layout) ?? {}),
      showHeroSection: home.blocks.some(
        (b) => b.type === 'hero' && b.visible !== false,
      ),
    };
  }

  return { ...config, sections };
}

/**
 * When editors still write to `sections.*` for unique types, push those props into the matching block.
 * Multi-instance blocks keep independent `block.props` (never overwritten from sections).
 */
export function syncPagesFromSections(
  config: Record<string, any>,
): Record<string, any> {
  const pages = asRecord(config.pages);
  const home = pages?.home as PageDoc | undefined;
  if (!home?.blocks?.length) return config;

  const sections = asRecord(config.sections) ?? {};
  const blocks = home.blocks.map((block) => {
    if (!UNIQUE_HOME_BLOCK_TYPES.has(block.type)) {
      if (!block.props || Object.keys(block.props).length === 0) {
        return { ...block, props: defaultPropsForBlockType(block.type) };
      }
      return block;
    }
    const section = asRecord(sections[block.type]);
    if (!section) return block;
    const visible = section.showSection !== false;
    return {
      ...block,
      visible,
      props: { ...section },
    };
  });

  return {
    ...config,
    pages: {
      ...pages,
      home: { ...home, blocks },
    },
  };
}

export function migrateV1ToV2(
  config: Record<string, any>,
): Record<string, any> {
  const sections = asRecord(config.sections) ?? {};
  const layout = asRecord(config.layout) as
    | { showHeroSection?: boolean }
    | undefined;
  const home = buildDefaultHomePage(sections, layout);

  const next: Record<string, any> = {
    ...config,
    version: BUILDER_DOC_VERSION_V2,
    // Keep existing timestamp — do not stamp Date.now() on every SSR/client migrate.
    pages: {
      ...(asRecord(config.pages) ?? {}),
      home,
    },
  };

  return syncSectionsFromPages(next);
}

/**
 * Ensure config is v2 (pages.home.blocks) and sections/pages stay in sync.
 */
export function ensureBuilderDocumentV2(
  config: Record<string, any>,
): Record<string, any> {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const version = String(config.version ?? '1.0.0');
  const pages = asRecord(config.pages);
  const home = pages?.home as PageDoc | undefined;
  const hasValidHome =
    home &&
    home.id === 'home' &&
    Array.isArray(home.blocks) &&
    home.blocks.every(
      (b) =>
        b && typeof b.id === 'string' && isHomeContentBlockType(String(b.type)),
    );
  const isV2 = version === '2' || version.startsWith('2.');

  let next = { ...config };

  if (!hasValidHome || !isV2) {
    next = migrateV1ToV2(next);
  } else {
    next.version = BUILDER_DOC_VERSION_V2;
    // Round-trip: section edits → blocks → sections
    next = syncPagesFromSections(next);
    next = syncSectionsFromPages(next);
  }

  return next;
}

/** Branding payload for Restaurant.branding (no builder-only fields). */
export function extractPublishBranding(
  config: Record<string, any>,
): Record<string, unknown> {
  const ensured = ensureBuilderDocumentV2(config);
  const omitKeys = new Set([
    'restaurant',
    'seo',
    'metadata',
    'version',
    'lastModified',
  ]);
  return Object.fromEntries(
    Object.entries(ensured).filter(([key]) => !omitKeys.has(key)),
  );
}

export type PageValidationIssue = {
  path: string;
  message: string;
  severity: 'error' | 'warning';
};

function validateBlockInstance(
  block: BlockInstance,
  path: string,
  issues: PageValidationIssue[],
  ids: Set<string>,
  uniqueCounts: Map<string, number>,
  containerAncestorDepth = 0,
): void {
  if (!block?.id || typeof block.id !== 'string') {
    issues.push({
      path: `${path}.id`,
      message: 'block id is required',
      severity: 'error',
    });
  } else if (ids.has(block.id)) {
    issues.push({
      path: `${path}.id`,
      message: `duplicate block id ${block.id}`,
      severity: 'error',
    });
  } else {
    ids.add(block.id);
  }

  if (!isHomeContentBlockType(String(block?.type))) {
    issues.push({
      path: `${path}.type`,
      message: `unknown block type: ${block?.type}`,
      severity: 'error',
    });
  } else if (UNIQUE_HOME_BLOCK_TYPES.has(block.type)) {
    uniqueCounts.set(block.type, (uniqueCounts.get(block.type) ?? 0) + 1);
  }

  if (block.children?.length) {
    if (!CONTAINER_BLOCK_TYPES.has(block.type as ContainerBlockType)) {
      issues.push({
        path: `${path}.children`,
        message: `block type "${block.type}" cannot have children`,
        severity: 'error',
      });
    }
    const allowlist = CONTAINER_BLOCK_TYPES.has(
      block.type as ContainerBlockType,
    )
      ? CONTAINER_CHILD_ALLOWLIST[block.type as ContainerBlockType]
      : [];
    const childAncestorDepth = CONTAINER_BLOCK_TYPES.has(
      block.type as ContainerBlockType,
    )
      ? containerAncestorDepth + 1
      : containerAncestorDepth;
    block.children.forEach((child, childIndex) => {
      const childPath = `${path}.children[${childIndex}]`;
      if (!allowlist.includes(child.type)) {
        issues.push({
          path: `${childPath}.type`,
          message: `block type "${child.type}" is not allowed inside "${block.type}"`,
          severity: 'error',
        });
      }
      if (CONTAINER_BLOCK_TYPES.has(child.type as ContainerBlockType)) {
        if (block.type !== 'columns' || containerAncestorDepth !== 0) {
          issues.push({
            path: `${childPath}.type`,
            message: `nested container "${child.type}" is only allowed inside a root-level columns block`,
            severity: 'error',
          });
        }
      }
      if (block.type === 'canvas' && !parseBlockFrame(child.props?.frame)) {
        issues.push({
          path: `${childPath}.props.frame`,
          message: `canvas child requires props.frame with finite x/y`,
          severity: 'error',
        });
      }
      validateBlockInstance(
        child,
        childPath,
        issues,
        ids,
        uniqueCounts,
        childAncestorDepth,
      );
    });
  }
}

export function validatePageDocument(
  config: Record<string, any>,
): PageValidationIssue[] {
  const issues: PageValidationIssue[] = [];
  const pages = asRecord(config.pages);
  if (!pages) {
    issues.push({
      path: 'pages',
      message: 'pages is required in builder document v2',
      severity: 'error',
    });
    return issues;
  }

  const home = pages.home as PageDoc | undefined;
  if (!home) {
    issues.push({
      path: 'pages.home',
      message: 'pages.home is required',
      severity: 'error',
    });
    return issues;
  }

  if (!Array.isArray(home.blocks)) {
    issues.push({
      path: 'pages.home.blocks',
      message: 'pages.home.blocks must be an array',
      severity: 'error',
    });
    return issues;
  }

  const ids = new Set<string>();
  const uniqueCounts = new Map<string, number>();

  home.blocks.forEach((block, index) => {
    const path = `pages.home.blocks[${index}]`;
    validateBlockInstance(block, path, issues, ids, uniqueCounts);
  });

  for (const [type, count] of uniqueCounts) {
    if (count > 1) {
      issues.push({
        path: 'pages.home.blocks',
        message: `block type "${type}" may appear at most once (found ${count})`,
        severity: 'error',
      });
    }
  }

  // Custom pages
  for (const [pageId, page] of Object.entries(pages)) {
    if (pageId === 'home') continue;
    const doc = page as PageDoc;
    if (doc.kind === 'custom') {
      if (!doc.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(doc.slug)) {
        issues.push({
          path: `pages.${pageId}.slug`,
          message: 'custom page slug must be lowercase kebab-case',
          severity: 'error',
        });
      }
      const transactional = (doc.blocks ?? []).filter((b) =>
        ['menu', 'checkout'].includes(b.type),
      );
      if (transactional.length > 0) {
        issues.push({
          path: `pages.${pageId}.blocks`,
          message:
            'custom pages cannot include transactional blocks (menu/checkout)',
          severity: 'error',
        });
      }
    }
  }

  return issues;
}

export function reorderHomeBlocks(
  config: Record<string, any>,
  orderedIds: string[],
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const home = ensured.pages.home as PageDoc;
  const byId = new Map(home.blocks.map((b: BlockInstance) => [b.id, b]));
  const nextBlocks: BlockInstance[] = [];
  for (const id of orderedIds) {
    const block = byId.get(id);
    if (block) {
      nextBlocks.push(block);
      byId.delete(id);
    }
  }
  // Append any missing (safety)
  for (const block of byId.values()) {
    nextBlocks.push(block);
  }

  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      home: { ...home, blocks: nextBlocks },
    },
  };
  return syncSectionsFromPages(next);
}

export function defaultPropsForBlockType(
  type: HomeContentBlockType,
): Record<string, unknown> {
  switch (type) {
    case 'hero':
      return { showSection: true, textAlign: 'center', minHeight: 'lg' };
    case 'featured':
      return {
        showSection: true,
        title: { text: 'Los favoritos de la casa' },
        maxItems: 6,
        displayStyle: 'auto',
      };
    case 'menu':
      return {
        showSection: true,
        cardStyle: 'elevated',
        showImages: true,
        showPrices: true,
      };
    case 'about':
      return {
        showSection: true,
        title: { text: 'Nuestra historia' },
        body: 'Contá la historia de tu local.',
      };
    case 'testimonials':
      return {
        showSection: true,
        title: { text: 'Lo que dicen nuestros clientes' },
        items: [],
      };
    case 'faq':
      return {
        showSection: true,
        title: { text: 'Preguntas frecuentes' },
        items: [],
      };
    case 'info':
      return {
        showSection: true,
        layout: 'cards',
        showLocation: true,
        showHours: true,
      };
    case 'cta':
      return {
        showSection: true,
        title: { text: 'Pedí online' },
        subtitle: { text: 'Retiro o delivery en minutos.' },
        buttonText: 'Ver menú',
        buttonHref: '#menu-section',
      };
    case 'gallery':
      return {
        showSection: true,
        title: { text: 'Galería' },
        images: [],
      };
    case 'richText':
      return {
        showSection: true,
        title: { text: 'Más información' },
        body: 'Escribí aquí el contenido de esta sección.',
      };
    case 'hours':
      return {
        showSection: true,
        title: { text: 'Horarios' },
      };
    case 'map':
      return {
        showSection: true,
        title: { text: 'Cómo llegar' },
        zoom: 15,
      };
    case 'stack':
      return { showSection: true, gap: 'md' };
    case 'columns':
      return { showSection: true, ratio: '50-50', gap: 'md' };
    case 'canvas':
      return { showSection: true, minHeight: 480 };
    default: {
      const _exhaustive: never = type;
      return { showSection: true, _unknown: _exhaustive };
    }
  }
}

export function addHomeBlock(
  config: Record<string, any>,
  type: HomeContentBlockType,
  options?: { afterBlockId?: string },
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const home = ensured.pages.home as PageDoc;

  if (
    UNIQUE_HOME_BLOCK_TYPES.has(type) &&
    home.blocks.some((b: BlockInstance) => b.type === type)
  ) {
    throw new Error(`El bloque "${type}" ya existe en la home`);
  }

  const block: BlockInstance = {
    id: createBlockId(type),
    type,
    visible: true,
    props: defaultPropsForBlockType(type),
  };

  const blocks = [...home.blocks];
  if (options?.afterBlockId) {
    const idx = blocks.findIndex((b) => b.id === options.afterBlockId);
    if (idx >= 0) {
      blocks.splice(idx + 1, 0, block);
    } else {
      blocks.push(block);
    }
  } else {
    blocks.push(block);
  }

  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      home: { ...home, blocks },
    },
  };
  return syncSectionsFromPages(next);
}

export function removeHomeBlock(
  config: Record<string, any>,
  blockId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const home = ensured.pages.home as PageDoc;
  const blocks = home.blocks.filter((b: BlockInstance) => b.id !== blockId);
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      home: { ...home, blocks },
    },
  };
  return syncSectionsFromPages(next);
}

export function duplicateHomeBlock(
  config: Record<string, any>,
  blockId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const home = ensured.pages.home as PageDoc;
  const index = home.blocks.findIndex((b: BlockInstance) => b.id === blockId);
  if (index < 0) throw new Error('Bloque no encontrado');
  const source = home.blocks[index];
  if (UNIQUE_HOME_BLOCK_TYPES.has(source.type)) {
    throw new Error(`No se puede duplicar el bloque único "${source.type}"`);
  }
  const copy: BlockInstance = {
    id: createBlockId(source.type),
    type: source.type,
    visible: source.visible,
    props: { ...(source.props ?? {}) },
    ...(source.children?.length
      ? {
          children: source.children.map((child) => ({
            ...child,
            id: createBlockId(child.type),
            props: { ...(child.props ?? {}) },
          })),
        }
      : {}),
  };
  const blocks = [...home.blocks];
  blocks.splice(index + 1, 0, copy);
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      home: { ...home, blocks },
    },
  };
  return syncSectionsFromPages(next);
}

export function setHomeBlockVisibility(
  config: Record<string, any>,
  blockId: string,
  visible: boolean,
): Record<string, any> {
  return setBlockVisibility(config, blockId, visible);
}

export function setBlockVisibility(
  config: Record<string, any>,
  blockId: string,
  visible: boolean,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, blockId);
  if (!found) throw new Error('Bloque no encontrado');
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(page.blocks, blockId, (block) => ({
    ...block,
    visible,
    props: { ...(block.props ?? {}), showSection: visible },
  }));
  if (!updatedBlocks) throw new Error('Bloque no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

export function addPageBlock(
  config: Record<string, any>,
  pageId: string,
  type: HomeContentBlockType,
): Record<string, any> {
  if (pageId === 'home') return addHomeBlock(config, type);
  const ensured = ensureBuilderDocumentV2(config);
  const page = ensured.pages[pageId] as PageDoc | undefined;
  if (!page) throw new Error('Página no encontrada');
  if (
    UNIQUE_HOME_BLOCK_TYPES.has(type) &&
    page.blocks.some((b) => b.type === type)
  ) {
    throw new Error(`El bloque "${type}" ya existe en esta página`);
  }
  const block: BlockInstance = {
    id: createBlockId(type),
    type,
    visible: true,
    props: defaultPropsForBlockType(type),
  };
  return {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: [...page.blocks, block] },
    },
  };
}

export function removePageBlock(
  config: Record<string, any>,
  pageId: string,
  blockId: string,
): Record<string, any> {
  if (pageId === 'home') return removeHomeBlock(config, blockId);
  const ensured = ensureBuilderDocumentV2(config);
  const page = ensured.pages[pageId] as PageDoc | undefined;
  if (!page) throw new Error('Página no encontrada');
  return {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: {
        ...page,
        blocks: page.blocks.filter((b) => b.id !== blockId),
      },
    },
  };
}

export function duplicatePageBlock(
  config: Record<string, any>,
  pageId: string,
  blockId: string,
): Record<string, any> {
  if (pageId === 'home') return duplicateHomeBlock(config, blockId);
  const ensured = ensureBuilderDocumentV2(config);
  const page = ensured.pages[pageId] as PageDoc | undefined;
  if (!page) throw new Error('Página no encontrada');
  const index = page.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) throw new Error('Bloque no encontrado');
  const source = page.blocks[index];
  if (UNIQUE_HOME_BLOCK_TYPES.has(source.type)) {
    throw new Error(`No se puede duplicar el bloque único "${source.type}"`);
  }
  const copy: BlockInstance = {
    id: createBlockId(source.type),
    type: source.type,
    visible: source.visible,
    props: { ...(source.props ?? {}) },
    ...(source.children?.length
      ? {
          children: source.children.map((child) => ({
            ...child,
            id: createBlockId(child.type),
            props: { ...(child.props ?? {}) },
          })),
        }
      : {}),
  };
  const blocks = [...page.blocks];
  blocks.splice(index + 1, 0, copy);
  return {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks },
    },
  };
}

export function createCustomPage(
  config: Record<string, any>,
  input: { title: string; slug: string },
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const slug = input.slug.trim().toLowerCase();
  const pageId = `custom:${slug}`;
  if (ensured.pages[pageId]) {
    throw new Error('Ya existe una página con ese slug');
  }
  for (const existing of Object.values(ensured.pages)) {
    if (existing.slug === slug)
      throw new Error('Ya existe una página con ese slug');
  }

  const page: PageDoc = {
    id: pageId,
    kind: 'custom',
    title: input.title.trim() || 'Página',
    slug,
    blocks: [
      {
        id: createBlockId('richText'),
        type: 'richText',
        visible: true,
        props: defaultPropsForBlockType('richText'),
      },
    ],
  };

  return {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: page,
    },
  };
}

export function deleteCustomPage(
  config: Record<string, any>,
  pageId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  if (pageId === 'home' || !String(pageId).startsWith('custom:')) {
    throw new Error('Solo se pueden eliminar páginas custom');
  }
  const pages = { ...ensured.pages };
  delete pages[pageId];
  return {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages,
  };
}

export function reorderPageBlocks(
  config: Record<string, any>,
  pageId: string,
  orderedIds: string[],
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const page = ensured.pages[pageId] as PageDoc | undefined;
  if (!page) throw new Error('Página no encontrada');
  const byId = new Map(page.blocks.map((b: BlockInstance) => [b.id, b]));
  const nextBlocks: BlockInstance[] = [];
  for (const id of orderedIds) {
    const block = byId.get(id);
    if (block) {
      nextBlocks.push(block);
      byId.delete(id);
    }
  }
  for (const block of byId.values()) nextBlocks.push(block);

  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: nextBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

function updateBlockInTree(
  blocks: BlockInstance[],
  blockId: string,
  updater: (block: BlockInstance) => BlockInstance,
): BlockInstance[] | null {
  let found = false;
  const next = blocks.map((block) => {
    if (block.id === blockId) {
      found = true;
      return updater(block);
    }
    if (block.children?.length) {
      const updatedChildren = updateBlockInTree(
        block.children,
        blockId,
        updater,
      );
      if (updatedChildren) {
        found = true;
        return { ...block, children: updatedChildren };
      }
    }
    return block;
  });
  return found ? next : null;
}

function findInBlockTree(
  blocks: BlockInstance[],
  blockId: string,
): { block: BlockInstance; index: number; parentId?: string } | null {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.id === blockId) {
      return { block, index };
    }
    if (block.children?.length) {
      const inChild = findInBlockTree(block.children, blockId);
      if (inChild) {
        return { ...inChild, parentId: block.id };
      }
    }
  }
  return null;
}

function blockTreeHasType(
  blocks: BlockInstance[],
  type: HomeContentBlockType,
): boolean {
  for (const block of blocks) {
    if (block.type === type) return true;
    if (block.children?.length && blockTreeHasType(block.children, type))
      return true;
  }
  return false;
}

/** Find a block by id across all pages (including nested children). */
export function findBlockById(
  config: Record<string, any>,
  blockId: string,
): {
  pageId: string;
  page: PageDoc;
  block: BlockInstance;
  index: number;
  parentId?: string;
} | null {
  const ensured = ensureBuilderDocumentV2(config);
  const pages = asRecord(ensured.pages) ?? {};
  for (const [pageId, page] of Object.entries(pages)) {
    const doc = page as PageDoc;
    if (!doc?.blocks) continue;
    const found = findInBlockTree(doc.blocks, blockId);
    if (found) {
      return {
        pageId,
        page: doc,
        block: found.block,
        index: found.index,
        parentId: found.parentId,
      };
    }
  }
  return null;
}

/** Patch props on a specific block instance (source of truth for multi-instance). */
export function updateBlockProps(
  config: Record<string, any>,
  blockId: string,
  propsPatch: Record<string, unknown>,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, blockId);
  if (!found) throw new Error('Bloque no encontrado');
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(page.blocks, blockId, (block) => ({
    ...block,
    props: { ...(block.props ?? {}), ...propsPatch },
  }));
  if (!updatedBlocks) throw new Error('Bloque no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

/** Count container ancestors for a block (0 = page root). */
export function getBlockNestingDepth(
  config: Record<string, any>,
  blockId: string,
): number {
  const ensured = ensureBuilderDocumentV2(config);
  let depth = 0;
  let current = findBlockById(ensured, blockId);
  while (current?.parentId) {
    const parent = findBlockById(ensured, current.parentId);
    if (!parent) break;
    if (CONTAINER_BLOCK_TYPES.has(parent.block.type as ContainerBlockType)) {
      depth += 1;
    }
    current = parent;
  }
  return depth;
}

/**
 * Whether `type` can be added under `parentId` given allowlist + shallow nesting rules.
 * Nested containers: only `stack` inside a root-level `columns`.
 */
export function canAddChildType(
  config: Record<string, any>,
  parentId: string,
  type: HomeContentBlockType,
): boolean {
  const found = findBlockById(config, parentId);
  if (!found) return false;
  const parent = found.block;
  if (!CONTAINER_BLOCK_TYPES.has(parent.type as ContainerBlockType))
    return false;
  if (
    !CONTAINER_CHILD_ALLOWLIST[parent.type as ContainerBlockType].includes(type)
  )
    return false;
  if (CONTAINER_BLOCK_TYPES.has(type as ContainerBlockType)) {
    if (parent.type !== 'columns') return false;
    if (getBlockNestingDepth(config, parentId) !== 0) return false;
  }
  // Unique section types may appear at most once per page (root or nested).
  if (
    UNIQUE_HOME_BLOCK_TYPES.has(type) &&
    blockTreeHasType(found.page.blocks, type)
  ) {
    return false;
  }
  return true;
}

/** Allowlist filtered by nesting rules for UI dropdowns. */
export function allowedChildTypesForParent(
  config: Record<string, any>,
  parentId: string,
): HomeContentBlockType[] {
  const found = findBlockById(config, parentId);
  if (!found) return [];
  if (!CONTAINER_BLOCK_TYPES.has(found.block.type as ContainerBlockType))
    return [];
  return CONTAINER_CHILD_ALLOWLIST[
    found.block.type as ContainerBlockType
  ].filter((type) => canAddChildType(config, parentId, type));
}

export function addChildBlock(
  config: Record<string, any>,
  parentBlockId: string,
  type: HomeContentBlockType,
  options?: { afterChildId?: string },
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, parentBlockId);
  if (!found) throw new Error('Bloque contenedor no encontrado');
  const parent = found.block;
  if (!CONTAINER_BLOCK_TYPES.has(parent.type as ContainerBlockType)) {
    throw new Error('Solo los bloques stack, columns o canvas admiten hijos');
  }
  if (!canAddChildType(ensured, parentBlockId, type)) {
    throw new Error(
      `El bloque "${type}" no se puede añadir dentro de "${parent.type}"`,
    );
  }
  const siblingCount = parent.children?.length ?? 0;
  let child: BlockInstance = {
    id: createBlockId(type),
    type,
    visible: true,
    props: defaultPropsForBlockType(type),
  };
  if (parent.type === 'canvas') {
    child = setBlockFrame(
      child,
      defaultFrameForCanvasChild(siblingCount, type),
    );
  }
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(
    page.blocks,
    parentBlockId,
    (block) => {
      const siblings = [...(block.children ?? [])];
      if (options?.afterChildId) {
        const idx = siblings.findIndex((c) => c.id === options.afterChildId);
        if (idx >= 0) {
          siblings.splice(idx + 1, 0, child);
          return { ...block, children: siblings };
        }
      }
      siblings.push(child);
      return { ...block, children: siblings };
    },
  );
  if (!updatedBlocks) throw new Error('Bloque contenedor no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

/** Patch absolute frame on a canvas child (`props.frame`). Snaps x/y to 8px grid by default. */
export function updateChildFrame(
  config: Record<string, any>,
  childId: string,
  patch: Partial<BlockFrame>,
  options?: { applyGridSnap?: boolean },
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, childId);
  if (!found) throw new Error('Bloque no encontrado');
  const applyGridSnap = options?.applyGridSnap !== false;
  const current = getBlockFrame(found.block) ?? defaultFrameForCanvasChild(0);
  const next: BlockFrame = {
    x:
      patch.x !== undefined
        ? applyGridSnap
          ? snapCanvasCoord(patch.x)
          : patch.x
        : current.x,
    y:
      patch.y !== undefined
        ? applyGridSnap
          ? snapCanvasCoord(patch.y)
          : patch.y
        : current.y,
  };
  if (patch.w !== undefined) {
    next.w = Number.isFinite(patch.w) && patch.w > 0 ? patch.w : current.w;
  } else if (current.w !== undefined) {
    next.w = current.w;
  }
  if (patch.z !== undefined) {
    next.z = Number.isFinite(patch.z) ? patch.z : current.z;
  } else if (current.z !== undefined) {
    next.z = current.z;
  }
  return updateBlockProps(ensured, childId, { frame: next });
}

export function reorderChildBlocks(
  config: Record<string, any>,
  parentBlockId: string,
  orderedIds: string[],
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, parentBlockId);
  if (!found) throw new Error('Bloque contenedor no encontrado');
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(
    page.blocks,
    parentBlockId,
    (block) => {
      const byId = new Map(
        (block.children ?? []).map((child) => [child.id, child]),
      );
      const nextChildren: BlockInstance[] = [];
      for (const id of orderedIds) {
        const child = byId.get(id);
        if (child) {
          nextChildren.push(child);
          byId.delete(id);
        }
      }
      for (const child of byId.values()) nextChildren.push(child);
      return { ...block, children: nextChildren };
    },
  );
  if (!updatedBlocks) throw new Error('Bloque contenedor no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

export function removeChildBlock(
  config: Record<string, any>,
  parentBlockId: string,
  childId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, parentBlockId);
  if (!found) throw new Error('Bloque contenedor no encontrado');
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(
    page.blocks,
    parentBlockId,
    (block) => ({
      ...block,
      children: (block.children ?? []).filter((child) => child.id !== childId),
    }),
  );
  if (!updatedBlocks) throw new Error('Bloque contenedor no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

export function duplicateChildBlock(
  config: Record<string, any>,
  parentBlockId: string,
  childId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, parentBlockId);
  if (!found) throw new Error('Bloque contenedor no encontrado');
  const parent = found.block;
  if (!CONTAINER_BLOCK_TYPES.has(parent.type as ContainerBlockType)) {
    throw new Error('Solo los bloques stack, columns o canvas admiten hijos');
  }
  const source = (parent.children ?? []).find((c) => c.id === childId);
  if (!source) throw new Error('Bloque hijo no encontrado');
  if (UNIQUE_HOME_BLOCK_TYPES.has(source.type)) {
    throw new Error(`No se puede duplicar el bloque único "${source.type}"`);
  }
  let copy: BlockInstance = {
    id: createBlockId(source.type),
    type: source.type,
    visible: source.visible,
    props: { ...(source.props ?? {}) },
  };
  if (parent.type === 'canvas') {
    const frame = getBlockFrame(source);
    copy = setBlockFrame(
      copy,
      frame
        ? {
            ...frame,
            x: snapCanvasCoord(frame.x + 16),
            y: snapCanvasCoord(frame.y + 16),
          }
        : defaultFrameForCanvasChild(parent.children?.length ?? 0),
    );
  }
  const { pageId, page } = found;
  const updatedBlocks = updateBlockInTree(
    page.blocks,
    parentBlockId,
    (block) => {
      const siblings = [...(block.children ?? [])];
      const idx = siblings.findIndex((c) => c.id === childId);
      if (idx < 0) return block;
      siblings.splice(idx + 1, 0, copy);
      return { ...block, children: siblings };
    },
  );
  if (!updatedBlocks) throw new Error('Bloque contenedor no encontrado');
  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      [pageId]: { ...page, blocks: updatedBlocks },
    },
  };
  return pageId === 'home' ? syncSectionsFromPages(next) : next;
}

export type ResolvedBlockPlacement =
  | { kind: 'root'; pageId: string; blockId: string; block: BlockInstance }
  | {
      kind: 'child';
      pageId: string;
      parentId: string;
      blockId: string;
      block: BlockInstance;
    };

/** Resolve whether a block sits at page root or inside a container. */
export function resolveBlockPlacement(
  config: Record<string, any>,
  blockId: string,
): ResolvedBlockPlacement | null {
  const found = findBlockById(config, blockId);
  if (!found) return null;
  if (found.parentId) {
    return {
      kind: 'child',
      pageId: found.pageId,
      parentId: found.parentId,
      blockId: found.block.id,
      block: found.block,
    };
  }
  return {
    kind: 'root',
    pageId: found.pageId,
    blockId: found.block.id,
    block: found.block,
  };
}

export function setColumnsRatio(
  config: Record<string, any>,
  blockId: string,
  ratio: ColumnsRatio,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, blockId);
  if (!found) throw new Error('Bloque no encontrado');
  if (found.block.type !== 'columns') {
    throw new Error('Solo aplica a bloques columns');
  }
  return updateBlockProps(ensured, blockId, { ratio });
}

/** Copy style/props of a block into metadata clipboard. */
export function copyBlockStyleToClipboard(
  config: Record<string, any>,
  blockId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const found = findBlockById(ensured, blockId);
  if (!found) throw new Error('Bloque no encontrado');
  const props = { ...(found.block.props ?? {}) };
  return {
    ...ensured,
    metadata: {
      ...((ensured.metadata as object) ?? {}),
      clipboardBlockProps: {
        type: found.block.type,
        ...props,
      },
    },
  };
}

/** Paste clipboard style onto a target block of the same type. */
export function pasteBlockStyleOntoBlock(
  config: Record<string, any>,
  blockId: string,
): Record<string, any> {
  const ensured = ensureBuilderDocumentV2(config);
  const clipboard = asRecord(
    (
      ensured.metadata as
        | { clipboardBlockProps?: Record<string, unknown> }
        | undefined
    )?.clipboardBlockProps,
  );
  if (!clipboard || typeof clipboard.type !== 'string') {
    throw new Error('No hay estilo copiado');
  }
  const found = findBlockById(ensured, blockId);
  if (!found) throw new Error('Bloque no encontrado');
  if (found.block.type !== clipboard.type) {
    throw new Error('El estilo copiado es de otro tipo de bloque');
  }
  const { type: clipboardType, ...props } = clipboard;
  void clipboardType;
  return updateBlockProps(ensured, blockId, props);
}

export type HomePresetId =
  | 'order-online'
  | 'reserve-table'
  | 'brand-menu'
  | 'delivery-push';

export type HomePreset = {
  id: HomePresetId;
  label: string;
  description: string;
  /** Ordered block types to include (visible). */
  blocks: HomeContentBlockType[];
};

export const HOME_PRESETS: HomePreset[] = [
  {
    id: 'order-online',
    label: 'Pedir online',
    description: 'Portada, destacados, menú y llamado a pedir.',
    blocks: ['hero', 'featured', 'menu', 'cta', 'info'],
  },
  {
    id: 'reserve-table',
    label: 'Reservar mesa',
    description: 'Historia, horarios, mapa e info del local.',
    blocks: ['hero', 'about', 'hours', 'map', 'info', 'faq'],
  },
  {
    id: 'brand-menu',
    label: 'Marca + menú',
    description: 'Historia, menú, opiniones y galería.',
    blocks: ['hero', 'about', 'menu', 'testimonials', 'gallery', 'info'],
  },
  {
    id: 'delivery-push',
    label: 'Delivery agresivo',
    description: 'Menú arriba, CTAs y FAQ de envíos.',
    blocks: ['hero', 'cta', 'menu', 'featured', 'faq', 'cta', 'info'],
  },
];

/**
 * Replace home composition with a typed preset (keeps shell sections / theme).
 */
export function applyHomePreset(
  config: Record<string, any>,
  presetId: HomePresetId,
): Record<string, any> {
  const preset = HOME_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error('Preset no encontrado');

  const ensured = ensureBuilderDocumentV2(config);
  const home = ensured.pages.home as PageDoc;
  const existingByType = new Map<HomeContentBlockType, BlockInstance[]>();
  for (const block of home.blocks) {
    const list = existingByType.get(block.type) ?? [];
    list.push(block);
    existingByType.set(block.type, list);
  }

  const nextBlocks: BlockInstance[] = [];
  const usedIds = new Set<string>();

  for (const type of preset.blocks) {
    const pool = existingByType.get(type) ?? [];
    const reusable = pool.find((b) => !usedIds.has(b.id));
    if (reusable) {
      usedIds.add(reusable.id);
      nextBlocks.push({
        ...reusable,
        visible: true,
        props: {
          ...(reusable.props ?? defaultPropsForBlockType(type)),
          showSection: true,
        },
      });
    } else {
      nextBlocks.push({
        id: createBlockId(type),
        type,
        visible: true,
        props: defaultPropsForBlockType(type),
      });
    }
  }

  const next = {
    ...ensured,
    lastModified: new Date().toISOString(),
    pages: {
      ...ensured.pages,
      home: { ...home, blocks: nextBlocks },
    },
  };
  return syncSectionsFromPages(next);
}
