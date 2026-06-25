import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionResolverService } from './subscription-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesCatalogService } from '../common/services/roles-catalog.service';

describe('SubscriptionResolverService', () => {
  let service: SubscriptionResolverService;

  const prisma = {
    restaurantMembership: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    subscription: { findFirst: jest.fn(), findUnique: jest.fn() },
  };

  const rolesCatalog = {
    getOwnerRoleId: jest.fn().mockResolvedValue('role-owner'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesCatalogService, useValue: rolesCatalog },
      ],
    }).compile();

    service = module.get(SubscriptionResolverService);
  });

  it('prefiere suscripción ancla del dueño sobre la del restaurante', async () => {
    prisma.restaurantMembership.findFirst.mockResolvedValue({
      userId: 'user-1',
    });
    prisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-account',
      userId: 'user-1',
      restaurantId: 'resto-a',
      planId: 'PROFESSIONAL',
    });

    const result = await service.resolveForRestaurant('resto-b', {
      select: { id: true, planId: true },
    });

    expect(result).toEqual(
      expect.objectContaining({ id: 'sub-account', planId: 'PROFESSIONAL' }),
    );
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('hace fallback a suscripción por restaurante si no hay cuenta', async () => {
    prisma.restaurantMembership.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub-legacy',
      restaurantId: 'resto-b',
      planId: 'STARTER',
    });

    const result = await service.resolveForRestaurant('resto-b', {
      select: { id: true },
    });

    expect(result).toEqual(expect.objectContaining({ id: 'sub-legacy' }));
  });
});
