import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { RolesCatalogService } from '../common/services/roles-catalog.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
import { SubscriptionResolverService } from '../subscriptions/subscription-resolver.service';
import { GoLiveEnforcementService } from './services/go-live-enforcement.service';
import { PublicHttpCacheService } from '../common/services/public-http-cache.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    role: { findUnique: jest.Mock };
    restaurantMembership: { count: jest.Mock; upsert: jest.Mock };
  };
  let rolesCatalog: {
    ensureSystemRoles: jest.Mock;
    getOwnerRoleId: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      restaurantMembership: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(),
      },
    };
    rolesCatalog = {
      ensureSystemRoles: jest.fn().mockResolvedValue(undefined),
      getOwnerRoleId: jest.fn().mockResolvedValue('role-owner'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: {} },
        { provide: RolesCatalogService, useValue: rolesCatalog },
        { provide: SubscriptionResolverService, useValue: {} },
        { provide: RestaurantSettingsService, useValue: {} },
        { provide: GoLiveEnforcementService, useValue: {} },
        {
          provide: PublicHttpCacheService,
          useValue: {
            invalidatePublicRestaurants: jest.fn().mockResolvedValue(undefined),
            invalidatePublicMenuBySlug: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('associateUserWithRestaurant', () => {
    it('does not demote SUPER_ADMIN to OWNER when creating a restaurant', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-owner',
        name: 'OWNER',
      });
      prisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        roleId: 'role-super',
        role: { name: 'SUPER_ADMIN' },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.restaurantMembership.upsert.mockResolvedValue({});

      await service.associateUserWithRestaurant('user-1', 'resto-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { restaurantId: 'resto-1' },
      });
      expect(prisma.user.update.mock.calls[0][0].data.roleId).toBeUndefined();
      expect(prisma.restaurantMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            roleId: 'role-super',
          }),
        }),
      );
    });

    it('assigns OWNER for regular users', async () => {
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-owner',
        name: 'OWNER',
      });
      prisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        roleId: null,
        role: { name: 'WAITER' },
      });
      prisma.user.update.mockResolvedValue({});
      prisma.restaurantMembership.upsert.mockResolvedValue({});

      await service.associateUserWithRestaurant('user-2', 'resto-2');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { restaurantId: 'resto-2', roleId: 'role-owner' },
      });
    });
  });
});
