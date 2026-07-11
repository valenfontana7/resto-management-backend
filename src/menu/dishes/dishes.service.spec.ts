import { Test, TestingModule } from '@nestjs/testing';
import { DishesService } from './dishes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { ImageProcessingService } from '../../common/services/image-processing.service';
import { PlanEntitlementsService } from '../../subscriptions/plans/plan-entitlements.service';
import { SubscriptionResolverService } from '../../subscriptions/subscription-resolver.service';
import { MenuBusinessEventsService } from '../../business-events/publishers/menu-business-events.service';

describe('DishesService', () => {
  let service: DishesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DishesService,
        { provide: PrismaService, useValue: {} },
        {
          provide: OwnershipService,
          useValue: { verifyUserOwnsRestaurant: jest.fn() },
        },
        { provide: ImageProcessingService, useValue: {} },
        { provide: PlanEntitlementsService, useValue: {} },
        { provide: SubscriptionResolverService, useValue: {} },
        { provide: MenuBusinessEventsService, useValue: {} },
      ],
    }).compile();

    service = module.get<DishesService>(DishesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
