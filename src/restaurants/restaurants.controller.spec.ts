import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { AuthService } from '../auth/auth.service';

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [
        {
          provide: RestaurantsService,
          useValue: {},
        },
        {
          provide: AuthService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
