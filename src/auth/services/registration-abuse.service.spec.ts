import { ConflictException } from '@nestjs/common';
import { RegistrationAbuseService } from './registration-abuse.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RegistrationAbuseService', () => {
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    systemSettings: {
      findFirst: jest.fn(),
    },
  };

  const service = new RegistrationAbuseService(
    prisma as unknown as PrismaService,
    cache as never,
    undefined,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.systemSettings.findFirst.mockResolvedValue({
      registrationDisabled: false,
      maintenanceEnabled: false,
    });
    cache.get.mockResolvedValue(undefined);
    prisma.user.count.mockResolvedValue(0);
  });

  describe('assertRegistrationAllowed', () => {
    it('rejects when the exact email is already registered', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1' });

      await expect(
        service.assertRegistrationAllowed({
          ip: '1.2.3.4',
          email: 'voss@gmai.betos',
          name: 'Juan Peres',
          source: 'auth.register-magic-link',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when a plus-tag alias shares the same identity', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.user.findMany.mockResolvedValueOnce([
        { email: 'voss+1@gmai.betos' },
      ]);

      await expect(
        service.assertRegistrationAllowed({
          ip: '1.2.3.4',
          email: 'voss@gmai.betos',
          name: 'Juan Peres',
          source: 'auth.register-magic-link',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when the base email exists and a plus-tag alias is attempted', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-1' });

      await expect(
        service.assertRegistrationAllowed({
          ip: '1.2.3.4',
          email: 'voss+2@gmai.betos',
          name: 'Juan Peres',
          source: 'auth.register-magic-link',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
