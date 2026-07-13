import { posix } from 'node:path';
import { BundleMedia, BundleMediaImage } from '../types';

export interface MediaManifestEntry {
  id: string;
  type: string;
  filename: string;
  url: string;
  source: BundleMediaImage['source'];
  prompt: string | null;
  priority: string;
  status: 'ready' | 'replacement-recommended' | 'replacement-required';
  replacementRequired: boolean;
  alt: string;
  note?: string;
}

export interface MappedMedia {
  /** mediaId -> URL pública resuelta (basePath + filename normalizado). */
  urlById: Map<string, string>;
  manifest: MediaManifestEntry[];
}

/**
 * No descarga ni genera nada: resuelve URLs y persiste el manifest.
 * La descarga/generación diferida la resuelve Bentoo después del import.
 */
export function mapMedia(media: BundleMedia): MappedMedia {
  const urlById = new Map<string, string>();
  const manifest: MediaManifestEntry[] = [];

  for (const image of media.images) {
    const url = resolveMediaUrl(media.basePath, image.filename);
    urlById.set(image.id, url);
    manifest.push({
      id: image.id,
      type: image.type,
      filename: image.filename,
      url,
      source: image.source,
      prompt: image.prompt ?? null,
      priority: image.priority,
      status: resolveStatus(image),
      replacementRequired: image.priority.includes('replace'),
      alt: image.alt,
      ...(image.note ? { note: image.note } : {}),
    });
  }

  return { urlById, manifest };
}

function resolveStatus(image: BundleMediaImage): MediaManifestEntry['status'] {
  if (image.priority.startsWith('high') && image.priority.includes('replace')) {
    return 'replacement-required';
  }
  if (image.priority.includes('replace') || image.source === 'PLACEHOLDER') {
    return 'replacement-recommended';
  }
  return 'ready';
}

export function resolveMediaUrl(basePath: string, filename: string): string {
  const trimmed = filename.trim();
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/api/uploads/') ||
    trimmed.startsWith('/demo/')
  ) {
    return trimmed;
  }

  const joined = posix.normalize(posix.join(basePath, filename));
  return joined.startsWith('/') ? joined : `/${joined}`;
}
