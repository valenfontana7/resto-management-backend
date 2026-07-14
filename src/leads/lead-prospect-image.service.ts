import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { S3Service } from '../storage/s3.service';
import type { ProspectBundle } from '../prospect-importer/types';
import { buildProspectImagePlaceholder } from './lead-prospect-image-placeholder';

export interface ImageGenerationReport {
  slug: string;
  outputDir: string;
  storage: 'local' | 's3';
  generated: number;
  skipped: number;
  failed: number;
  placeholders: number;
  files: string[];
  warnings: string[];
}

const MAX_GENERATED_IMAGES = 12;
const DEFAULT_IMAGEN_MODEL = 'imagen-4.0-generate-001';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

type GeneratedImageResult = {
  buffer: Buffer;
  source: 'imagen' | 'gemini-flash-image' | 'placeholder';
};

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
      placeholders: 0,
      files: [],
      warnings: [],
    };

    if (!this.client) {
      report.warnings.push(
        'Sin GEMINI_API_KEY/GOOGLE_API_KEY: las imágenes serán placeholders geométricos.',
      );
    }

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

          const result = await this.generateOneImage(
            image.prompt ?? image.alt ?? bundle.prospect.businessName,
            primaryColor,
          );
          if (result.source === 'placeholder') report.placeholders++;
          const compressed = await this.compressJpeg(result.buffer);
          await writeFile(target, compressed);
          report.generated++;
          report.files.push(image.filename);
        } else {
          const s3Key = `leads-demos/${slug}/${image.filename}`;
          const result = await this.generateOneImage(
            image.prompt ?? image.alt ?? bundle.prospect.businessName,
            primaryColor,
          );
          if (result.source === 'placeholder') report.placeholders++;
          const compressed = await this.compressJpeg(result.buffer);
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

    if (report.placeholders > 0) {
      report.warnings.push(
        `${report.placeholders} imagen(es) usaron placeholder (Imagen/Gemini image gen no devolvió bytes). Revisar API key, modelo y cuota.`,
      );
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
  ): Promise<GeneratedImageResult> {
    if (this.client) {
      const fromImagen = await this.tryImagen(prompt);
      if (fromImagen) {
        return { buffer: fromImagen, source: 'imagen' };
      }

      const fromGemini = await this.tryGeminiFlashImage(prompt);
      if (fromGemini) {
        return { buffer: fromGemini, source: 'gemini-flash-image' };
      }
    }

    return {
      buffer: await buildProspectImagePlaceholder(brandColor),
      source: 'placeholder',
    };
  }

  private async tryImagen(prompt: string): Promise<Buffer | null> {
    if (!this.client) return null;

    try {
      const model =
        this.configService.get<string>('LEADS_PROSPECT_IMAGE_MODEL')?.trim() ||
        DEFAULT_IMAGEN_MODEL;
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

      this.logger.warn(
        `Imagen (${model}) respondió sin imageBytes; se intenta Gemini Flash Image.`,
      );
    } catch (error) {
      this.logger.warn(
        `Gemini Imagen falló, se intenta Gemini Flash Image: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return null;
  }

  private async tryGeminiFlashImage(prompt: string): Promise<Buffer | null> {
    if (!this.client) return null;

    try {
      const model =
        this.configService
          .get<string>('LEADS_PROSPECT_GEMINI_IMAGE_MODEL')
          ?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;

      const response = await this.client.models.generateContent({
        model,
        contents: `${prompt}. Editorial food photography, appetizing, soft natural light, no text, no watermark.`,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data) {
          return Buffer.from(data, 'base64');
        }
      }

      this.logger.warn(
        `Gemini Flash Image (${model}) respondió sin inlineData; se usa placeholder.`,
      );
    } catch (error) {
      this.logger.warn(
        `Gemini Flash Image falló, usando placeholder: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return null;
  }
}
