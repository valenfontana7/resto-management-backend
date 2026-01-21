import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Service } from '../../storage/s3.service';

export type ImageType = 'dish' | 'category' | 'restaurant' | 'user';

interface ProcessedImage {
  key: string;
  url: string;
}

/**
 * Servicio centralizado para procesamiento de imágenes.
 * Maneja base64, URLs, y keys de S3 de forma unificada.
 *
 * @example
 * ```typescript
 * // Procesar imagen (base64, key, o URL)
 * const key = await this.imageProcessing.processImage(dto.image, 'dish');
 *
 * // Convertir key a URL para cliente
 * const url = this.imageProcessing.toClientUrl(dish.image);
 * ```
 */
@Injectable()
export class ImageProcessingService {
  constructor(private readonly s3: S3Service) {}

  /**
   * Procesa una imagen que puede venir como:
   * - Base64 string (data:image/...)
   * - Key directa de S3 (dishes/abc123.jpg)
   * - URL del proxy (/api/uploads/...)
   *
   * @param imageInput - La imagen en cualquiera de los formatos soportados
   * @param type - Tipo de imagen para determinar el folder de S3
   * @returns La key de S3 para guardar en DB, o null si no hay imagen
   */
  async processImage(
    imageInput: string | null | undefined,
    type: ImageType,
  ): Promise<string | null> {
    if (!imageInput) {
      return null;
    }

    // Si ya es una key directa de S3 (de /api/uploads/image)
    if (this.isS3Key(imageInput)) {
      return imageInput;
    }

    // Si es una URL del proxy, extraer la key
    if (imageInput.startsWith('/api/uploads/')) {
      return this.extractKeyFromProxyUrl(imageInput);
    }

    // Si es una URL externa (https://..., http://...), aceptarla tal cual
    // Ejemplos: Unsplash, imgbb, imgur, Cloudinary, etc.
    if (/^https?:\/\//i.test(imageInput)) {
      return imageInput; // Devolver la URL externa sin procesar
    }

    // Si es base64, subir a S3
    if (this.isBase64Image(imageInput)) {
      return this.uploadBase64Image(imageInput, type);
    }

    throw new BadRequestException(
      'Invalid image format. Expected base64 data URL or S3 key.',
    );
  }

  /**
   * Sube una imagen base64 a S3.
   *
   * @param base64String - String base64 con formato data:image/...
   * @param type - Tipo de imagen para el folder
   * @returns Key de S3
   */
  async uploadBase64Image(
    base64String: string,
    type: ImageType,
  ): Promise<string> {
    const match = base64String.match(
      /^data:image\/([a-zA-Z0-9]+);base64,(.+)$/,
    );

    if (!match) {
      throw new BadRequestException(
        'Invalid base64 image format. Expected: data:image/{type};base64,{data}',
      );
    }

    const [, extension, data] = match;
    const buffer = Buffer.from(data, 'base64');
    const folder = this.getFolderForType(type);
    const filename = `${this.generateUniqueId()}.${extension}`;
    const key = `${folder}/${filename}`;

    const result = await this.s3.uploadObject({
      key,
      body: buffer,
      contentType: `image/${extension}`,
      cacheControl: 'public, max-age=31536000',
    });

    return result.key;
  }

  /**
   * Elimina una imagen de S3 por su URL o key.
   *
   * @param imageUrlOrKey - URL completa o key de S3
   */
  async deleteImage(imageUrlOrKey: string | null | undefined): Promise<void> {
    if (!imageUrlOrKey) return;

    await this.s3.deleteObjectByUrl(imageUrlOrKey);
  }

  /**
   * Convierte una key de S3 a URL para el cliente.
   * Wrapper del método de S3Service para consistencia.
   *
   * @param key - Key de S3 guardada en DB
   * @returns URL pública o del proxy
   */
  toClientUrl(key: string | null | undefined): string | null | undefined {
    return this.s3.toClientUrl(key);
  }

  /**
   * Transforma un objeto, convirtiendo campos de imagen a URLs.
   *
   * @param obj - Objeto con campos de imagen
   * @param imageFields - Nombres de los campos que son imágenes
   * @returns Objeto con las imágenes transformadas a URLs
   */
  transformImageFields<T extends Record<string, any>>(
    obj: T,
    imageFields: (keyof T)[],
  ): T {
    const result = { ...obj };

    for (const field of imageFields) {
      if (field in result && typeof result[field] === 'string') {
        (result as any)[field] = this.toClientUrl(result[field] as string);
      }
    }

    return result;
  }

  /**
   * Genera una URL pre-firmada para subida directa a S3.
   */
  async generatePresignedUpload(
    type: ImageType,
    extension: string,
  ): Promise<ProcessedImage> {
    const folder = this.getFolderForType(type);
    const filename = `${this.generateUniqueId()}.${extension}`;
    const key = `${folder}/${filename}`;

    const presigned = await this.s3.createPresignedPutUrl({
      key,
      contentType: `image/${extension}`,
      expiresInSeconds: 300, // 5 minutos
    });

    return {
      key,
      url: presigned.uploadUrl,
    };
  }

  // ─── Métodos privados ───────────────────────────────────────────────

  private isS3Key(value: string): boolean {
    // Patrón: folder/filename.ext
    return /^[a-z0-9_-]+\/[a-z0-9_-]+\.[a-z0-9]+$/i.test(value);
  }

  private isBase64Image(value: string): boolean {
    return /^data:image\//i.test(value);
  }

  private extractKeyFromProxyUrl(url: string): string | null {
    return url.replace(/^\/api\/uploads\//, '').split('?')[0] || null;
  }

  private getFolderForType(type: ImageType): string {
    const folders: Record<ImageType, string> = {
      dish: 'dishes',
      category: 'categories',
      restaurant: 'restaurants',
      user: 'users',
    };
    return folders[type];
  }

  private generateUniqueId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
