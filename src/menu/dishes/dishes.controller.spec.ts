import { Test, TestingModule } from '@nestjs/testing';
import { DishesController } from './dishes.controller';
import { DishesService } from './dishes.service';
import { PublicWriteAbuseService } from '../../common/services/public-write-abuse.service';

describe('DishesController', () => {
  let controller: DishesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DishesController],
      providers: [
        {
          provide: DishesService,
          useValue: {},
        },
        {
          provide: PublicWriteAbuseService,
          useValue: { assertPublicWriteAllowed: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<DishesController>(DishesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
