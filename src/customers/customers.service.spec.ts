import { BadRequestException } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: any;
  let jwtService: {
    sign: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let emailService: jest.Mocked<Pick<EmailService, 'sendGenericEmail'>>;

  const baseProfile = {
    id: 'profile-1',
    restaurantId: 'rest-1',
    identityId: 'identity-1',
    displayName: 'Ana',
    email: 'ana@example.com',
    phone: null,
    marketingOptIn: false,
    defaultAddress: null,
    preferences: null,
    createdAt: new Date('2026-05-14T10:00:00.000Z'),
    updatedAt: new Date('2026-05-14T10:00:00.000Z'),
    identity: {
      id: 'identity-1',
      emailVerified: false,
      phoneVerified: false,
      createdAt: new Date('2026-05-14T09:00:00.000Z'),
    },
  };

  const sessionProfile = {
    ...baseProfile,
    restaurant: {
      id: 'rest-1',
      slug: 'mi-restaurante',
      name: 'Mi Restaurante',
    },
  };

  beforeEach(() => {
    prisma = {
      restaurantCustomerProfile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      customerLoginLink: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      customerIdentity: {
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
      },
      reservation: {
        findMany: jest.fn(),
      },
      loyaltyAccount: {
        findFirst: jest.fn(),
      },
      coupon: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({
            customerLoginLink: prisma.customerLoginLink,
            customerIdentity: prisma.customerIdentity,
          });
        }

        return Promise.all(input as Promise<unknown>[]);
      }),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('customer-session-jwt'),
      verifyAsync: jest.fn(),
    };

    emailService = {
      sendGenericEmail: jest.fn().mockResolvedValue(true),
    };

    const images = {
      toEmailAssetUrl: jest.fn().mockReturnValue(null),
    };

    service = new CustomersService(
      prisma,
      jwtService as any,
      images as any,
      emailService as any,
    );
  });

  it('returns a generic response when the profile does not exist', async () => {
    prisma.restaurantCustomerProfile.findFirst.mockResolvedValue(null);

    const result = await service.requestSession('rest-1', {
      email: 'missing@example.com',
    });

    expect(result).toEqual({
      sent: true,
      channel: 'email',
      expiresInMinutes: 15,
      devLink: undefined,
    });
    expect(prisma.customerLoginLink.create).not.toHaveBeenCalled();
  });

  it('creates a dev magic link for an existing customer profile', async () => {
    prisma.restaurantCustomerProfile.findFirst.mockResolvedValue(
      sessionProfile,
    );
    prisma.customerLoginLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.customerLoginLink.create.mockResolvedValue({ id: 'link-1' });

    const result = await service.requestSession('rest-1', {
      email: 'ANA@example.com',
      redirect: '/mi-restaurante/checkout',
    });

    expect(result.sent).toBe(true);
    expect(result.channel).toBe('email');
    expect(result.devLink).toContain('/mi-restaurante/cuenta/magic-link');
    expect(result.devLink).toContain('redirect=%2Fmi-restaurante%2Fcheckout');
    expect(emailService.sendGenericEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'Tu acceso a Mi Restaurante',
      expect.any(String),
      'Mi Restaurante',
    );
  });

  it('sanitizes callback redirects back to the customer account page', async () => {
    prisma.restaurantCustomerProfile.findFirst.mockResolvedValue(
      sessionProfile,
    );
    prisma.customerLoginLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.customerLoginLink.create.mockResolvedValue({ id: 'link-1' });

    const result = await service.requestSession('rest-1', {
      email: 'ana@example.com',
      redirect: '/mi-restaurante/cuenta/magic-link?token=stale',
    });

    expect(result.devLink).toContain('redirect=%2Fmi-restaurante%2Fcuenta');
    expect(result.devLink).not.toContain(
      'redirect=%2Fmi-restaurante%2Fcuenta%2Fmagic-link',
    );
  });

  it('consumes a valid magic link and returns a signed customer session', async () => {
    prisma.customerLoginLink.findUnique.mockResolvedValue({
      id: 'link-1',
      customerProfileId: 'profile-1',
      tokenHash: 'hash',
      channel: 'email',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
      customerProfile: sessionProfile,
    });
    prisma.customerLoginLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.customerIdentity.update.mockResolvedValue({ id: 'identity-1' });

    const result = await service.consumeSession(
      'rest-1',
      'valid-raw-token-value-1234567890',
    );

    expect(result.profile.id).toBe('profile-1');
    expect(result.profile.identity.emailVerified).toBe(true);
    expect(result.token).toBe('customer-session-jwt');
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        sub: 'profile-1',
        restaurantId: 'rest-1',
        identityId: 'identity-1',
        type: 'customer-session',
      },
      { expiresIn: '30d' },
    );
  });

  it('returns session null when the bearer token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(
      service.getSession('rest-1', 'Bearer broken-token'),
    ).resolves.toEqual({
      session: null,
    });
  });

  it('builds the customer account overview from the active session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'profile-1',
      restaurantId: 'rest-1',
      identityId: 'identity-1',
      type: 'customer-session',
      exp: 1_800_000_000,
    });
    prisma.restaurantCustomerProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: '0001',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        type: 'DELIVERY',
        total: 24500,
        discount: 1500,
        couponCode: 'ANA10',
        publicTrackingToken: 'track-1',
        createdAt: new Date('2026-05-15T11:00:00.000Z'),
        items: [
          {
            dishId: 'dish-1',
            quantity: 2,
            dish: { name: 'Milanesa napolitana' },
          },
        ],
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      {
        id: 'reservation-1',
        date: new Date('2026-05-20T00:00:00.000Z'),
        time: '21:00',
        partySize: 4,
        status: 'CONFIRMED',
        notes: 'Mesa junto a la ventana',
        createdAt: new Date('2026-05-10T10:00:00.000Z'),
      },
    ]);
    prisma.loyaltyAccount.findFirst.mockResolvedValue({
      id: 'loyalty-1',
      points: 240,
      totalEarned: 540,
      totalRedeemed: 300,
      tier: 'SILVER',
    });
    prisma.coupon.findMany.mockResolvedValue([
      {
        code: 'ANA10',
        name: 'Vuelta al barrio',
        description: '10% en tu próximo pedido',
        type: 'PERCENTAGE',
        value: { toNumber: () => 10 },
      },
    ]);

    const result = await service.getAccountOverview(
      'rest-1',
      'Bearer session-token',
    );

    expect(result.profile.id).toBe('profile-1');
    expect(result.loyalty?.tier).toBe('SILVER');
    expect(result.recentOrders).toHaveLength(1);
    expect(result.recentOrders[0].items[0]).toEqual({
      dishId: 'dish-1',
      name: 'Milanesa napolitana',
      quantity: 2,
    });
    expect(result.recentCoupons[0]).toMatchObject({
      code: 'ANA10',
      name: 'Vuelta al barrio',
      lastDiscount: 1500,
    });
  });

  it('updates profile preferences and address for the active session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'profile-1',
      restaurantId: 'rest-1',
      identityId: 'identity-1',
      type: 'customer-session',
      exp: 1_800_000_000,
    });
    prisma.restaurantCustomerProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.restaurantCustomerProfile.update.mockResolvedValue({
      ...baseProfile,
      displayName: 'Ana Perez',
      phone: '+541112345678',
      defaultAddress: {
        label: 'Casa',
        street: 'Siempre Viva 742',
      },
      preferences: {
        preferredOrderType: 'delivery',
        favoriteDishes: [{ dishId: 'dish-1', name: 'Milanesa napolitana' }],
      },
    });

    const result = await service.updateAccount(
      'rest-1',
      'Bearer session-token',
      {
        displayName: 'Ana Perez',
        phone: '+54 11 1234 5678',
        defaultAddress: {
          label: 'Casa',
          street: 'Siempre Viva 742',
          city: null,
          postalCode: null,
          reference: null,
          notes: null,
        },
        preferences: {
          preferredOrderType: 'delivery',
          dietaryNotes: null,
          favoriteDishes: [{ dishId: 'dish-1', name: 'Milanesa napolitana' }],
        },
      },
    );

    expect(result.displayName).toBe('Ana Perez');
    expect(result.phone).toBe('+541112345678');
    expect(result.defaultAddress).toMatchObject({
      label: 'Casa',
      street: 'Siempre Viva 742',
    });
    expect(result.preferences.favoriteDishes).toEqual([
      { dishId: 'dish-1', name: 'Milanesa napolitana' },
    ]);
  });

  it('rejects invalid customer magic links', async () => {
    await expect(
      service.consumeSession('rest-1', 'short'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
