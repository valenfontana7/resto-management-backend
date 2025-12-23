import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('MP_TOKEN_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error('MP_TOKEN_ENCRYPTION_KEY is required');
    }

    this.key = EncryptionService.parseKey(raw);
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString('utf8');
  }

  private static parseKey(raw: string): Buffer {
    const trimmed = raw.trim();

    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }

    // base64
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length !== 32) {
      throw new Error(
        'MP_TOKEN_ENCRYPTION_KEY must be 32 bytes (hex 64 chars or base64 for 32 bytes)',
      );
    }

    return decoded;
  }
}
