import { Readable } from 'stream';
import sharp from 'sharp';

const TRANSCODE_SOURCE_TYPES = new Set([
  'image/avif',
  'image/webp',
  'image/svg+xml',
]);

function queryParamString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function wantsCompatTranscode(req: {
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  const format = queryParamString(req.query?.format).trim().toLowerCase();
  if (format === 'jpeg' || format === 'jpg' || format === 'png') {
    return true;
  }

  const ua = String(req.headers?.['user-agent'] ?? '');
  return ua.includes('BentooSalonDesktop') || ua.includes('BentooSalonLocal');
}

export function resolveCompatOutputFormat(req: {
  query?: Record<string, unknown>;
}): 'jpeg' | 'png' {
  const format = queryParamString(req.query?.format).trim().toLowerCase();
  return format === 'png' ? 'png' : 'jpeg';
}

export function needsTranscode(contentType?: string | null): boolean {
  const ct = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (!ct) return false;
  return TRANSCODE_SOURCE_TYPES.has(ct);
}

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function transcodeForCompatClient(
  input: Buffer,
  outputFormat: 'jpeg' | 'png',
): Promise<{ buffer: Buffer; contentType: string }> {
  const pipeline = sharp(input, { animated: false }).rotate();

  if (outputFormat === 'png') {
    const buffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
    return { buffer, contentType: 'image/png' };
  }

  const buffer = await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return { buffer, contentType: 'image/jpeg' };
}
