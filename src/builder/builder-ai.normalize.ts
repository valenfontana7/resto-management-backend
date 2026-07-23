import {
  HOME_CONTENT_BLOCK_TYPES,
  HOME_PRESETS,
  type HomeContentBlockType,
  type HomePresetId,
} from './types/page-doc';
import type { BuilderAiComposeIntent } from './dto/builder-ai.dto';

export type ComposeHomeBlockResult = {
  type: HomeContentBlockType;
  props: Record<string, unknown>;
};

export type ComposeHomeResult = {
  presetId: HomePresetId;
  blocks: ComposeHomeBlockResult[];
};

const ALLOWED_TYPES = new Set<string>(HOME_CONTENT_BLOCK_TYPES);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function pickString(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeTextNode(
  value: unknown,
  max = 200,
): { text: string } | undefined {
  const text = pickString(value, max);
  if (!text) return undefined;
  return { text };
}

/**
 * Keep only safe copy-related props from model output.
 * Never trusts contact data / hours / images invented by the model.
 */
export function sanitizeBlockProps(
  type: HomeContentBlockType,
  raw: unknown,
): Record<string, unknown> {
  const src = asRecord(raw) ?? {};
  const props: Record<string, unknown> = { showSection: true };

  const title =
    sanitizeTextNode(asRecord(src.title)?.text ?? src.title, 120) ?? undefined;
  const subtitle =
    sanitizeTextNode(asRecord(src.subtitle)?.text ?? src.subtitle, 200) ??
    undefined;
  const body = pickString(src.body, 1200);
  const buttonText = pickString(src.buttonText, 60);

  switch (type) {
    case 'hero':
      if (title) props.title = title;
      if (subtitle) props.subtitle = subtitle;
      if (buttonText) {
        props.ctaButton = {
          enabled: true,
          text: buttonText,
          href: '#menu-section',
        };
      }
      break;
    case 'about':
    case 'richText':
      if (title) props.title = title;
      if (body) props.body = body;
      break;
    case 'cta':
      if (title) props.title = title;
      if (subtitle) props.subtitle = subtitle;
      if (buttonText) props.buttonText = buttonText;
      if (!props.buttonHref) props.buttonHref = '#menu-section';
      break;
    case 'featured':
    case 'testimonials':
    case 'faq':
    case 'gallery':
    case 'hours':
    case 'map':
      if (title) props.title = title;
      break;
    case 'menu':
    case 'info':
    case 'stack':
    case 'columns':
    case 'canvas':
      if (title) props.title = title;
      break;
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      break;
    }
  }

  return props;
}

/**
 * Parse/normalize compose-home AI JSON into a preset-aligned payload.
 */
export function normalizeComposeHomeResponse(
  intent: BuilderAiComposeIntent,
  raw: unknown,
): ComposeHomeResult {
  const preset = HOME_PRESETS.find((p) => p.id === intent);
  const presetId: HomePresetId = preset?.id ?? intent;
  const expectedTypes = preset?.blocks ?? ['hero', 'menu', 'info'];

  const root = asRecord(raw) ?? {};
  const rawBlocks = Array.isArray(root.blocks) ? root.blocks : [];

  const byTypeQueue = new Map<
    HomeContentBlockType,
    Record<string, unknown>[]
  >();
  for (const entry of rawBlocks) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const type = typeof rec.type === 'string' ? rec.type : '';
    if (!ALLOWED_TYPES.has(type)) continue;
    const typed = type as HomeContentBlockType;
    const list = byTypeQueue.get(typed) ?? [];
    list.push(asRecord(rec.props) ?? {});
    byTypeQueue.set(typed, list);
  }

  const blocks: ComposeHomeBlockResult[] = expectedTypes.map((type) => {
    const queue = byTypeQueue.get(type) ?? [];
    const propsRaw = queue.shift() ?? {};
    byTypeQueue.set(type, queue);
    return {
      type,
      props: sanitizeBlockProps(type, propsRaw),
    };
  });

  return { presetId, blocks };
}

export function normalizeImprovedCopy(raw: unknown, fallback: string): string {
  const root = asRecord(raw);
  const fromObject = root ? pickString(root.text, 800) : undefined;
  const fromString = typeof raw === 'string' ? pickString(raw, 800) : undefined;
  return fromObject || fromString || fallback.trim() || 'Tu local, a un click.';
}
