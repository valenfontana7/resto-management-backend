import { HttpException } from '@nestjs/common';
import { AuthEmailAbuseService } from './auth-email-abuse.service';

describe('AuthEmailAbuseService', () => {
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
  };

  let service: AuthEmailAbuseService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(undefined);
    service = new AuthEmailAbuseService(cache as never);
  });

  it('allows first magic link request', async () => {
    await expect(
      service.assertEmailDeliveryAllowed({
        ip: '1.2.3.4',
        email: 'user@example.com',
        scope: 'magic_link',
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks when recipient limit exceeded', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (String(key).includes('recipient')) return 4;
      return 0;
    });

    await expect(
      service.assertEmailDeliveryAllowed({
        ip: '1.2.3.4',
        email: 'user@example.com',
        scope: 'magic_link',
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
