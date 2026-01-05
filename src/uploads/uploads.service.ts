import { Injectable } from '@nestjs/common';
import { s3Client } from './s3.client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadsService {
  private bucket = process.env.S3_BUCKET || '';
  private region = process.env.S3_REGION || '';
  private publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL || '').trim();

  isS3Enabled(): boolean {
    return Boolean(
      (process.env.S3_BUCKET || '').trim() &&
        (process.env.S3_KEY || '').trim() &&
        (process.env.S3_SECRET || '').trim(),
    );
  }

  private joinUrl(base: string, path: string): string {
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
  }

  publicUrlForKey(key: string): string {
    const cleanedKey = key.replace(/^\/+/, '');

    if (this.publicBaseUrl) {
      return this.joinUrl(this.publicBaseUrl, cleanedKey);
    }

    const bucket = (process.env.S3_BUCKET || '').trim();
    const region = (process.env.S3_REGION || '').trim();

    // Default compatible with DigitalOcean Spaces public URL format
    // https://{bucket}.{region}.digitaloceanspaces.com/{key}
    if (bucket && region) {
      return `https://${bucket}.${region}.digitaloceanspaces.com/${cleanedKey}`;
    }

    // Fallback: return key as-is (shouldn't happen in correctly configured env)
    return cleanedKey;
  }

  /**
   * Convierte valores guardados en DB ("/uploads/..." o URLs) en una URL pública.
   * - Si ya es una URL (http/https), se devuelve tal cual.
   * - Si es una ruta "/uploads/..." y S3 está habilitado, se mapea a la URL pública.
   */
  resolvePublicUrl(value: string): string {
    if (!value) return value;
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;
    if (!v.startsWith('/uploads/')) return v;
    if (!this.isS3Enabled()) return v;
    const key = v.replace(/^\//, ''); // '/uploads/..' -> 'uploads/..'
    return this.publicUrlForKey(key);
  }

  async getPresignedPutUrl(key: string, contentType: string, expiresIn = 60) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    // For Spaces the returned URL is valid for PUT
    return url;
  }

  async putPublicObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    const { key, body, contentType } = params;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    });

    await s3Client.send(command);
    return this.publicUrlForKey(key);
  }
}
