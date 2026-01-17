import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  S3Client,
  type ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl?: string;
  private readonly proxyBaseUrl?: string;
  private readonly keyPrefix: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private readonly objectAcl?: ObjectCannedACL;

  constructor(private readonly config: ConfigService) {
    // DigitalOcean Spaces (S3-compatible) env vars
    // Prefer S3_* (este repo), fallback a AWS_* por compatibilidad.
    this.bucket = this.mustGetFirst('S3_BUCKET', 'AWS_S3_BUCKET');
    this.region =
      this.config.get<string>('S3_REGION') ||
      this.config.get<string>('AWS_REGION') ||
      'us-east-1';
    this.publicBaseUrl =
      this.config.get<string>('S3_PUBLIC_BASE_URL') ||
      this.config.get<string>('AWS_S3_PUBLIC_BASE_URL') ||
      undefined;

    this.proxyBaseUrl =
      (
        this.config.get<string>('BASE_URL') ||
        this.config.get<string>('BACKEND_URL') ||
        ''
      ).trim() || undefined;

    const prefix = (
      this.config.get<string>('S3_KEY_PREFIX') ||
      this.config.get<string>('AWS_S3_KEY_PREFIX') ||
      ''
    ).trim();
    this.keyPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') + '/' : '';

    this.endpoint =
      this.config.get<string>('S3_ENDPOINT') ||
      this.config.get<string>('AWS_S3_ENDPOINT') ||
      undefined;

    const forcePathStyleRaw =
      this.config.get<string>('S3_FORCE_PATH_STYLE') ||
      this.config.get<string>('AWS_S3_FORCE_PATH_STYLE') ||
      '';
    this.forcePathStyle = /^(1|true|yes)$/i.test(forcePathStyleRaw);

    const aclRaw = (
      this.config.get<string>('S3_ACL') ??
      this.config.get<string>('AWS_S3_ACL') ??
      ''
    ).trim();
    this.objectAcl = aclRaw ? (aclRaw as ObjectCannedACL) : undefined;

    const accessKeyId =
      this.config.get<string>('S3_KEY') ||
      this.config.get<string>('AWS_ACCESS_KEY_ID') ||
      undefined;
    const secretAccessKey =
      this.config.get<string>('S3_SECRET') ||
      this.config.get<string>('AWS_SECRET_ACCESS_KEY') ||
      undefined;

    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      forcePathStyle: this.forcePathStyle,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });

    console.log('S3Service initialized:', {
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint,
      keyPrefix: this.keyPrefix,
      hasCredentials: !!(accessKeyId && secretAccessKey),
    });
  }

  async uploadObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ key: string; url: string }> {
    const physicalKey = this.normalizeKey(params.key);

    // Try to create bucket if not exists (for dev with MinIO)
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      // Ignore if bucket already exists
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: physicalKey,
        Body: params.body,
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
        ACL: this.objectAcl,
      }),
    );

    const logicalKey = this.stripPrefix(physicalKey);
    return { key: logicalKey, url: this.buildProxyUrl(logicalKey) };
  }

  async createPresignedPutUrl(params: {
    key: string;
    contentType?: string;
    cacheControl?: string;
    expiresInSeconds?: number;
  }): Promise<{
    key: string;
    uploadUrl: string;
    publicUrl: string;
    requiredHeaders: Record<string, string>;
  }> {
    const physicalKey = this.normalizeKey(params.key);
    const logicalKey = this.stripPrefix(physicalKey);

    const putParams: Record<string, unknown> = {
      Bucket: this.bucket,
      Key: physicalKey,
      ...(params.contentType ? { ContentType: params.contentType } : {}),
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
      ...(this.objectAcl ? { ACL: this.objectAcl } : {}),
    };

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand(putParams as any),
      { expiresIn: params.expiresInSeconds ?? 60 },
    );

    const requiredHeaders: Record<string, string> = {};
    if (params.contentType)
      requiredHeaders['Content-Type'] = params.contentType;
    if (params.cacheControl)
      requiredHeaders['Cache-Control'] = params.cacheControl;
    if (this.objectAcl) requiredHeaders['x-amz-acl'] = String(this.objectAcl);

    return {
      key: logicalKey,
      uploadUrl,
      publicUrl: this.buildProxyUrl(logicalKey),
      requiredHeaders,
    };
  }

  async createPresignedGetUrl(params: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const physicalKey = this.normalizeKey(params.key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: physicalKey,
      }),
      { expiresIn: params.expiresInSeconds ?? 60 },
    );
  }

  async headObject(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    etag?: string;
    lastModified?: Date;
  }> {
    try {
      const physicalKey = this.normalizeKey(key);
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: physicalKey }),
      );

      return {
        contentType: head.ContentType,
        contentLength:
          typeof head.ContentLength === 'number'
            ? head.ContentLength
            : undefined,
        etag: head.ETag,
        lastModified: head.LastModified,
      };
    } catch (err: any) {
      if (this.isNotFound(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async headObjectRaw(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    etag?: string;
    lastModified?: Date;
  }> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return {
        contentType: head.ContentType,
        contentLength:
          typeof head.ContentLength === 'number'
            ? head.ContentLength
            : undefined,
        etag: head.ETag,
        lastModified: head.LastModified,
      };
    } catch (err: any) {
      if (this.isNotFound(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async getObjectStream(key: string): Promise<{ body: Readable }> {
    try {
      const physicalKey = this.normalizeKey(key);
      const obj = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: physicalKey }),
      );

      const body = obj.Body as any;
      if (!body || typeof body.pipe !== 'function') {
        throw new InternalServerErrorException('Invalid object body');
      }

      return { body };
    } catch (err: any) {
      if (this.isNotFound(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async getObjectStreamRaw(key: string): Promise<{ body: Readable }> {
    try {
      const obj = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      const body = obj.Body as any;
      if (!body || typeof body.pipe !== 'function') {
        throw new InternalServerErrorException('Invalid object body');
      }

      return { body };
    } catch (err: any) {
      if (this.isNotFound(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async deleteObjectByUrl(urlOrKey: string | null | undefined): Promise<void> {
    try {
      if (!urlOrKey) return;

      const logicalKey = this.extractKey(urlOrKey);
      if (!logicalKey) return;

      const physicalKey = this.normalizeKey(logicalKey);

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: physicalKey,
        }),
      );
    } catch {
      // best-effort
    }
  }

  buildProxyUrl(key: string): string {
    const cleanedKey = key.replace(/^\/+/, '');
    const encoded = cleanedKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    if (this.proxyBaseUrl) {
      return `${this.proxyBaseUrl.replace(/\/+$/g, '')}/api/uploads/${encoded}`;
    }

    return `/api/uploads/${encoded}`;
  }

  toClientUrl(value: string | null | undefined): string | null | undefined {
    if (value == null) return value;
    const trimmed = String(value).trim();
    if (!trimmed) return value;
    if (/^https?:\/\//i.test(trimmed)) {
      // If it's a localhost URL, replace with current proxy base
      if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
        const path = trimmed.replace(/^https?:\/\/[^\/]+/, '');
        if (this.proxyBaseUrl) {
          return `${this.proxyBaseUrl.replace(/\/+$/g, '')}${path}`;
        }
        return path;
      }
      return trimmed;
    }
    if (trimmed.startsWith('/api/uploads/')) return trimmed;
    return this.buildProxyUrl(trimmed);
  }

  buildPublicUrl(key: string): string {
    const normalizedKey = this.normalizeKey(key);

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/+$/g, '')}/${normalizedKey}`;
    }

    // If endpoint is configured (e.g., DigitalOcean Spaces), build URL from it
    if (this.endpoint) {
      const endpointUrl = new URL(this.endpoint);
      const origin = endpointUrl.origin;
      const host = endpointUrl.hostname;

      if (this.forcePathStyle) {
        // https://endpoint/bucket/key
        return `${origin}/${this.bucket}/${normalizedKey}`;
      }

      // Virtual-hosted style: https://bucket.endpoint/key
      return `${endpointUrl.protocol}//${this.bucket}.${host}/${normalizedKey}`;
    }

    // Standard AWS virtual-hosted–style URL fallback
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${normalizedKey}`;
  }

  private mustGetFirst(...names: string[]): string {
    for (const name of names) {
      const value = (this.config.get<string>(name) || '').trim();
      if (value) return value;
    }
    throw new Error(`Missing required env var: ${names.join(' or ')}`);
  }

  private normalizeKey(key: string): string {
    const cleaned = key.replace(/^\/+/, '');

    if (!this.keyPrefix) return cleaned;

    // If caller accidentally passes an already-prefixed key, don't double-prefix.
    if (cleaned.startsWith(this.keyPrefix)) return cleaned;

    return `${this.keyPrefix}${cleaned}`;
  }

  private stripPrefix(physicalKey: string): string {
    if (!this.keyPrefix) return physicalKey;
    return physicalKey.startsWith(this.keyPrefix)
      ? physicalKey.substring(this.keyPrefix.length)
      : physicalKey;
  }

  private isNotFound(err: any): boolean {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404) return true;
    const name = String(err?.name || '');
    return name === 'NoSuchKey' || name === 'NotFound';
  }

  private extractKey(urlOrKey: string): string | null {
    // If caller passes a raw key
    if (!/^https?:\/\//i.test(urlOrKey)) {
      return this.stripPrefix(this.normalizeKey(urlOrKey));
    }

    try {
      const url = new URL(urlOrKey);
      const pathKey = url.pathname.replace(/^\/+/, '');
      if (!pathKey) return null;

      // If publicBaseUrl is configured and matches, strip it cleanly
      if (this.publicBaseUrl) {
        try {
          const base = new URL(this.publicBaseUrl);
          if (url.origin === base.origin) {
            const basePath = base.pathname.replace(/^\/+|\/+$/g, '');
            const fullPath = url.pathname.replace(/^\/+/, '');
            if (!basePath) return fullPath;
            if (fullPath.startsWith(basePath + '/')) {
              return fullPath.substring(basePath.length + 1);
            }
            return null;
          }
        } catch {
          // ignore
        }
      }

      // Otherwise, only accept standard S3 hostnames for this bucket
      const host = url.hostname.toLowerCase();
      const bucketLower = this.bucket.toLowerCase();

      // DigitalOcean Spaces endpoint host allow-list
      if (this.endpoint) {
        try {
          const endpointUrl = new URL(this.endpoint);
          const endpointHost = endpointUrl.hostname.toLowerCase();

          // Path-style URL: https://endpoint/bucket/key
          if (host === endpointHost) {
            const prefix = `${bucketLower}/`;
            if (pathKey.toLowerCase().startsWith(prefix)) {
              return this.stripPrefix(pathKey.substring(prefix.length));
            }
            return null;
          }

          // Virtual-hosted: https://bucket.endpoint/key
          if (host === `${bucketLower}.${endpointHost}`) {
            return this.stripPrefix(pathKey);
          }
        } catch {
          // ignore
        }
      }

      // AWS S3 hostnames for this bucket
      const bucketHostPrefix = `${bucketLower}.s3.`;
      if (
        !host.startsWith(bucketHostPrefix) &&
        host !== `${bucketLower}.s3.amazonaws.com`
      ) {
        return null;
      }

      return pathKey;
    } catch {
      return null;
    }
  }
}
