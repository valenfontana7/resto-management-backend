import { UnauthorizedException } from '@nestjs/common';
import { OwnerEmailVerificationService } from './owner-email-verification.service';

describe('OwnerEmailVerificationService', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    authEmailVerificationLink: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const emailService = {
    sendGenericEmail: jest.fn(),
  };

  let service: OwnerEmailVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OWNER_EMAIL_VERIFICATION_REQUIRED;
    service = new OwnerEmailVerificationService(
      prisma as never,
      emailService as never,
    );
  });

  it('treats existing users as verified when requirement disabled', () => {
    process.env.OWNER_EMAIL_VERIFICATION_REQUIRED = 'false';

    expect(
      service.isEmailVerified({
        emailVerifiedAt: null,
        role: { name: 'OWNER' },
      }),
    ).toBe(true);
  });

  it('requires emailVerifiedAt for owners when enabled', () => {
    expect(
      service.isEmailVerified({
        emailVerifiedAt: null,
        role: { name: 'OWNER' },
      }),
    ).toBe(false);
    expect(
      service.isEmailVerified({
        emailVerifiedAt: new Date(),
        role: { name: 'OWNER' },
      }),
    ).toBe(true);
  });

  it('bypasses verification for super admin', () => {
    expect(
      service.isEmailVerified({
        emailVerifiedAt: null,
        role: { name: 'SUPER_ADMIN' },
      }),
    ).toBe(true);
  });

  it('throws EMAIL_VERIFICATION_REQUIRED when owner is unverified', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-1',
      emailVerifiedAt: null,
      role: { name: 'OWNER' },
    });

    await expect(
      service.assertOwnerEmailVerified('user-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EMAIL_VERIFICATION_REQUIRED',
      }),
    });
  });

  it('consumes a valid token and marks user verified', async () => {
    const now = new Date();
    prisma.authEmailVerificationLink.findUnique.mockResolvedValue({
      id: 'link-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      user: { id: 'user-1', deletedAt: null, isActive: true },
    });

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>) => {
        const tx = {
          authEmailVerificationLink: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        await callback(tx as never);
      },
    );

    await expect(
      service.consumeVerificationToken('a'.repeat(32)),
    ).resolves.toEqual({
      verified: true,
    });
  });

  it('rejects invalid tokens', async () => {
    prisma.authEmailVerificationLink.findUnique.mockResolvedValue(null);

    await expect(
      service.consumeVerificationToken('a'.repeat(32)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
