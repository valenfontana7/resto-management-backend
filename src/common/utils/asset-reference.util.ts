export function decodeUploadObjectKey(rawKey: string): string {
  return rawKey
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

export function normalizeAssetReference(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    const uploadPathMatch = url.pathname.match(
      /\/api\/(?:proxy\/)?uploads\/(.+)$/i,
    );
    if (uploadPathMatch) {
      return decodeUploadObjectKey(uploadPathMatch[1]);
    }

    return url.href;
  } catch {
    const localUploadPathMatch = trimmed.match(
      /^\/?api\/(?:proxy\/)?uploads\/(.+)$/i,
    );
    if (localUploadPathMatch) {
      return decodeUploadObjectKey(localUploadPathMatch[1]);
    }

    return trimmed.replace(/^\/+/, '');
  }
}
