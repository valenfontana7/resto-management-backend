import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Head,
  Post,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Public } from '../auth/decorators/public.decorator';
import { S3Service } from '../storage/s3.service';

@ApiTags('Uploads')
@Controller('api/uploads')
export class UploadsController {
  constructor(private readonly s3: S3Service) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a presigned GET URL (optional)' })
  @ApiQuery({ name: 'key', required: true })
  @Get('presign-get')
  async presignGet(@Query('key') keyParam: string) {
    const key = this.normalizeAndValidateKey(keyParam);
    const url = await this.s3.createPresignedGetUrl({
      key,
      expiresInSeconds: 60,
    });
    return { url, expiresInSeconds: 60 };
  }

  @Public()
  @ApiOperation({ summary: 'Proxy (stream) an object from Spaces by key' })
  @ApiParam({
    name: 'key',
    description: 'Object key inside the bucket (supports slashes)',
  })
  @Get('*key')
  async proxyGet(@Param('key') keyParam: string, @Res() res: Response) {
    try {
      const key = this.normalizeAndValidateKey(keyParam);

      const head = await this.s3.headObject(key);

      const ifNoneMatch = (
        res.req.headers['if-none-match'] as string | undefined
      )?.trim();
      if (ifNoneMatch && head.etag && ifNoneMatch === head.etag) {
        res.status(304);
        this.applyCacheHeaders(res, head);
        return res.end();
      }

      const object = await this.s3.getObjectStream(key);

      this.applyCacheHeaders(res, head);
      res.status(200);

      object.body.on('error', () => {
        if (!res.headersSent) {
          res.status(502).json({ message: 'Storage stream error' });
          return;
        }
        res.destroy();
      });

      res.on('close', () => {
        try {
          object.body.destroy();
        } catch {
          // ignore
        }
      });

      object.body.pipe(res);
      return;
    } catch (err: any) {
      const status = this.getHttpStatus(err);
      const message = this.getErrorMessage(err);

      if (res.headersSent) {
        res.destroy();
        return;
      }

      if (status === 404) return res.status(404).end();
      return res.status(status).json({ message });
    }
  }

  @Public()
  @ApiOperation({ summary: 'HEAD object from Spaces by key (metadata only)' })
  @ApiParam({
    name: 'key',
    description: 'Object key inside the bucket (supports slashes)',
  })
  @Head('*key')
  async proxyHead(@Param('key') keyParam: string, @Res() res: Response) {
    try {
      const key = this.normalizeAndValidateKey(keyParam);

      const head = await this.s3.headObject(key);

      res.status(200);
      this.applyCacheHeaders(res, head);
      return res.end();
    } catch (err: any) {
      const status = this.getHttpStatus(err);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      return res.status(status).end();
    }
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload an image (stores in Spaces). Returns key to store in DB.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiQuery({
    name: 'folder',
    required: false,
    description:
      'Optional folder/prefix (e.g., dishes, categories, restaurants)',
  })
  @Post('image')
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
    if (!file?.buffer || !file?.mimetype) {
      throw new BadRequestException('File is required');
    }

    const safeFolder =
      (folder || 'images')
        .replace(/[^a-z0-9-_\/]/gi, '')
        .replace(/^\/+|\/+$/g, '') || 'images';

    const extFromName = (file.originalname || '')
      .toLowerCase()
      .match(/\.(jpg|jpeg|png|webp|gif|svg)$/)?.[0];
    const extFromType = (() => {
      const ct = (file.mimetype || '').toLowerCase();
      if (ct === 'image/jpeg' || ct === 'image/jpg') return '.jpg';
      if (ct === 'image/png') return '.png';
      if (ct === 'image/webp') return '.webp';
      if (ct === 'image/gif') return '.gif';
      if (ct === 'image/svg+xml') return '.svg';
      return '';
    })();

    const ext = extFromName || extFromType || '.jpg';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `${safeFolder}/${unique}${ext}`;

    const uploaded = await this.s3.uploadObject({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    return {
      key: uploaded.key,
      url: this.s3.buildProxyUrl(uploaded.key),
    };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an image by key' })
  @ApiParam({
    name: 'key',
    description: 'Object key inside the bucket (supports slashes)',
  })
  @Delete('image/*key')
  async deleteImage(@Param('key') keyParam: string) {
    const key = this.normalizeAndValidateKey(keyParam);
    await this.s3.deleteObjectByUrl(key);
    return { success: true };
  }

  private normalizeAndValidateKey(raw: string): string {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // keep raw
    }

    const key = decoded.replace(/^\/+/, '');

    if (!key || key.length > 2048) {
      throw new BadRequestException('Invalid key');
    }

    if (key.includes('\\')) {
      throw new BadRequestException('Invalid key');
    }

    // prevent traversal-ish patterns
    if (/(^|\/)\.\.($|\/)/.test(key)) {
      throw new BadRequestException('Invalid key');
    }

    // basic control char guard
    if (/\u0000/.test(key)) {
      throw new BadRequestException('Invalid key');
    }

    return key;
  }

  private applyCacheHeaders(
    res: Response,
    head: {
      contentType?: string;
      contentLength?: number;
      etag?: string;
      lastModified?: Date;
    },
  ) {
    if (head.contentType) res.setHeader('Content-Type', head.contentType);
    if (typeof head.contentLength === 'number')
      res.setHeader('Content-Length', String(head.contentLength));
    if (head.etag) res.setHeader('ETag', head.etag);
    if (head.lastModified)
      res.setHeader('Last-Modified', head.lastModified.toUTCString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  private getHttpStatus(err: any): number {
    const status =
      typeof err?.getStatus === 'function'
        ? Number(err.getStatus())
        : typeof err?.status === 'number'
          ? err.status
          : typeof err?.$metadata?.httpStatusCode === 'number'
            ? err.$metadata.httpStatusCode
            : undefined;

    if (status && status >= 400 && status < 600) return status;
    return 500;
  }

  private getErrorMessage(err: any): string {
    const msg = err?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    return 'Unexpected error';
  }
}
