import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  it('encrypt/decrypt roundtrip', () => {
    const key = crypto.randomBytes(32).toString('base64');
    const config = new ConfigService({ MP_TOKEN_ENCRYPTION_KEY: key });
    const service = new EncryptionService(config);

    const plaintext = 'TEST_ACCESS_TOKEN_1234567890';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
