import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let prisma: any;
  let customersService: any;
  let loyaltyEvents: any;

  beforeEach(() => {
    prisma = {
      loyaltyAccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    customersService = {
      resolveSessionProfile: jest.fn(),
      upsertProfile: jest.fn(),
    };

    loyaltyEvents = {
      publishPointsEarned: jest.fn(),
      publishPointsRedeemed: jest.fn(),
      publishTierUpgraded: jest.fn(),
    };

    service = new LoyaltyService(prisma, customersService, loyaltyEvents);
  });

  it('returns the loyalty account tied to the active customer session', async () => {
    customersService.resolveSessionProfile.mockResolvedValue({
      profile: {
        id: 'profile-1',
        email: 'ana@example.com',
      },
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    prisma.loyaltyAccount.findFirst.mockResolvedValue({
      id: 'account-1',
      customerProfileId: 'profile-1',
      customerEmail: 'ana@example.com',
      transactions: [],
    });

    const result = await service.getAccountForSession(
      'rest-1',
      'Bearer valid-token',
    );

    expect(customersService.resolveSessionProfile).toHaveBeenCalledWith(
      'rest-1',
      'Bearer valid-token',
    );
    expect(prisma.loyaltyAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restaurantId: 'rest-1',
        }),
      }),
    );
    expect(result.id).toBe('account-1');
  });

  it('retrofits legacy accounts found by email with customerProfileId', async () => {
    customersService.resolveSessionProfile.mockResolvedValue({
      profile: {
        id: 'profile-1',
        email: 'ana@example.com',
      },
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    prisma.loyaltyAccount.findFirst.mockResolvedValue({
      id: 'account-1',
      customerProfileId: null,
      customerEmail: 'ana@example.com',
      transactions: [],
    });
    prisma.loyaltyAccount.update.mockResolvedValue({
      id: 'account-1',
      customerProfileId: 'profile-1',
      customerEmail: 'ana@example.com',
      transactions: [],
    });

    const result = await service.getAccountForSession(
      'rest-1',
      'Bearer valid-token',
    );

    expect(prisma.loyaltyAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-1' },
        data: { customerProfileId: 'profile-1' },
      }),
    );
    expect(result.customerProfileId).toBe('profile-1');
  });

  it('throws unauthorized when the customer session is invalid', async () => {
    customersService.resolveSessionProfile.mockResolvedValue(null);

    await expect(
      service.getAccountForSession('rest-1', 'Bearer invalid-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws not found when the session is valid but there is no loyalty account', async () => {
    customersService.resolveSessionProfile.mockResolvedValue({
      profile: {
        id: 'profile-1',
        email: 'ana@example.com',
      },
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    prisma.loyaltyAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.getAccountForSession('rest-1', 'Bearer valid-token'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
