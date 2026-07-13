import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { S3Service } from '../storage/s3.service';
import type { ProspectBundle } from '../prospect-importer/types';

export interface ImageGenerationReport {
  slug: string;
  outputDir: string;
  storage: 'local' | 's3';
  generated: number;
  skipped: number;
  failed: number;
  files: string[];
  warnings: string[];
}

const MAX_GENERATED_IMAGES = 12;

@Injectable()
export class LeadProspectImageService {
  private readonly logger = new Logger(LeadProspectImageService.name);
  private readonly client: GoogleGenAI | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3: S3Service,
  ) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  /**
   * Root local del frontend (`.../public`) solo si es usable.
   * En Docker (`cwd=/app`) el sibling resuelve a `/resto-management-system/public`
   * y no es escribible — devolvemos null para forzar S3.
   */
  resolvePublicRoot(): string | null {
    const configured = this.configService
      .get<string>('LEADS_ASSETS_PUBLIC_ROOT')
      ?.trim();
    if (configured) {
      return path.resolve(configured);
    }

    const candidates = [
      path.resolve(process.cwd(), '../resto-management-system/public'),
      path.resolve(process.cwd(), '../../resto-management-system/public'),
    ];

    for (const candidate of candidates) {
      if (this.isUnusableFilesystemRoot(candidate)) continue;
      if (!existsSync(candidate)) continue;
      return candidate;
    }

    return null;
  }

  private isUnusableFilesystemRoot(resolved: string): boolean {
    const normalized = path.normalize(resolved);
    return (
      normalized === path.normalize('/resto-management-system/public') ||
      /^[A-Za-z]:\\resto-management-system\\public$/i.test(normalized)
    );
  }

  async generateAssetsForBundle(
    bundle: ProspectBundle,
  ): Promise<ImageGenerationReport> {
    const slug =
      bundle.builder?.bentooImport?.demoSlug ??
      bundle.prospect.id.replace(/[^a-z0-9-]/gi, '-');
    const basePath = bundle.media.basePath
      .replace(/^\//, '')
      .replace(/\/$/, '');

    const localRoot = this.resolvePublicRoot();
    const useLocal = Boolean(localRoot);

    const outputDir = useLocal
      ? path.join(localRoot!, basePath)
      : `s3://leads-demos/${slug}`;

    if (useLocal) {
      await mkdir(outputDir, { recursive: true });
    }

    const images = bundle.media.images.filter(
      (img) => img.source === 'GENERATED',
    );
    const toProcess = this.dedupeByFilename(images).slice(
      0,
      MAX_GENERATED_IMAGES,
    );

    const report: ImageGenerationReport = {
      slug,
      outputDir,
      storage: useLocal ? 'local' : 's3',
      generated: 0,
      skipped: 0,
      failed: 0,
      files: [],
      warnings: [],
    };

    if (!useLocal) {
      report.warnings.push(
        'Sin carpeta public local (prod/Docker): subiendo assets a S3.',
      );
    }

    if (images.length > MAX_GENERATED_IMAGES) {
      report.warnings.push(
        `Se generaron ${MAX_GENERATED_IMAGES} de ${images.length} imágenes (límite de costo).`,
      );
    }

    const primaryColor = bundle.branding?.colorPalette?.primary ?? '#a31621';

    for (const image of toProcess) {
      try {
        if (useLocal) {
          const target = path.join(outputDir, image.filename);
          try {
            await access(target);
            report.skipped++;
            report.files.push(image.filename);
            continue;
          } catch {
            // missing — generate
          }

          const buffer = await this.generateOneImage(
            image.prompt ?? image.alt ?? bundle.prospect.businessName,
            primaryColor,
          );
          const compressed = await this.compressJpeg(buffer);
          await writeFile(target, compressed);
          report.generated++;
          report.files.push(image.filename);
        } else {
          const s3Key = `leads-demos/${slug}/${image.filename}`;
          const buffer = await this.generateOneImage(
            image.prompt ?? image.alt ?? bundle.prospect.businessName,
            primaryColor,
          );
          const compressed = await this.compressJpeg(buffer);
          const uploaded = await this.s3.uploadObject({
            key: s3Key,
            body: compressed,
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=31536000',
          });

          // El import resuelve URL por filename; usamos path proxy absoluto.
          image.filename = uploaded.url || this.s3.buildProxyUrl(s3Key);
          report.generated++;
          report.files.push(image.filename);
        }
      } catch (error) {
        report.failed++;
        const message = error instanceof Error ? error.message : String(error);
        report.warnings.push(
          `No se pudo generar ${image.filename}: ${message}`,
        );
        this.logger.warn(`Image gen failed for ${image.filename}: ${message}`);
      }
    }

    if (!useLocal && report.generated === 0 && report.failed > 0) {
      throw new Error(
        `No se pudieron guardar imágenes (S3). ${report.warnings.slice(0, 2).join('; ')}`,
      );
    }

    return report;
  }

  private async compressJpeg(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1200, 900, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  }

  private dedupeByFilename<T extends { filename: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.filename)) return false;
      seen.add(item.filename);
      return true;
    });
  }

  private async generateOneImage(
    prompt: string,
    brandColor: string,
  ): Promise<Buffer> {
    if (this.client) {
      try {
        const model =
          this.configService
            .get<string>('LEADS_PROSPECT_IMAGE_MODEL')
            ?.trim() || 'imagen-3.0-generate-002';
        const response = await this.client.models.generateImages({
          model,
          prompt: `${prompt}. Editorial food photography, appetizing, soft natural light, no text, no watermark.`,
          config: {
            numberOfImages: 1,
            aspectRatio: '4:3',
          },
        });

        const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;

        if (imageBytes) {
          return Buffer.from(imageBytes, 'base64');
        }
      } catch (error) {
        this.logger.warn(
          `Gemini Imagen falló, usando placeholder: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return this.buildPlaceholder(prompt, brandColor);
  }

  private async buildPlaceholder(
    label: string,
    brandColor: string,
  ): Promise<Buffer> {
    const safeLabel = label.slice(0, 80).replace(/[<>&"]/g, '');
    const svg = `
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#1c1917" stop-opacity="0.9"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="900" fill="url(#g)"/>
        <text x="600" y="430" text-anchor="middle" fill="#faf6f0" font-family="Arial,sans-serif" font-size="42" font-weight="700">Bentoo Demo</text>
        <text x="600" y="490" text-anchor="middle" fill="#faf6f0" font-family="Arial,sans-serif" font-size="24" opacity="0.9">${safeLabel}</text>
        <text x="600" y="540" text-anchor="middle" fill="#faf6f0" font-family="Arial,sans-serif" font-size="16" opacity="0.7">Reemplazar con foto real antes de presentar</text>
      </svg>`;

    return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  }
}
