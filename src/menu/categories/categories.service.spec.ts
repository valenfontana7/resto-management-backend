import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { ImageProcessingService } from '../../common/services/image-processing.service';
import { PlanEntitlementsService } from '../../subscriptions/plans/plan-entitlements.service';

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: {} },
        {
          provide: OwnershipService,
          useValue: { verifyUserOwnsRestaurant: jest.fn() },
        },
        { provide: ImageProcessingService, useValue: {} },
        { provide: PlanEntitlementsService, useValue: {} },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
