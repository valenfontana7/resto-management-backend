import { Injectable } from '@nestjs/common';
import { s3Client } from './s3.client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadsService {
  private bucket = process.env.S3_BUCKET || '';

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
}
