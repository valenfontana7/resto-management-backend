import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsService } from './restaurants.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { RolesCatalogService } from '../common/services/roles-catalog.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';

describe('RestaurantsService', () => {
  let service: RestaurantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        { provide: PrismaService, useValue: {} },
        { provide: S3Service, useValue: {} },
        { provide: RolesCatalogService, useValue: {} },
        { provide: RestaurantSettingsService, useValue: {} },
      ],
    }).compile();

    service = module.get<RestaurantsService>(RestaurantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
