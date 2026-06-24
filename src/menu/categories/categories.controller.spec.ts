import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { CategoriesController } from './categories.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { S3Service } from '../../storage/s3.service';
import { PublicWriteAbuseService } from '../../common/services/public-write-abuse.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      controllers: [CategoriesController],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: CategoriesService, useValue: {} },
        { provide: S3Service, useValue: { toClientUrl: (url: string) => url } },
        {
          provide: PublicWriteAbuseService,
          useValue: { assertPublicWriteAllowed: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
