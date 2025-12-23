import { Test, TestingModule } from '@nestjs/testing';
import { DishesService } from './dishes.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DishesService', () => {
  let service: DishesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DishesService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DishesService>(DishesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
