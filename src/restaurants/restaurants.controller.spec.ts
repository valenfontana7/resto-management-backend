import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantUsersService } from './services/restaurant-users.service';
import { RestaurantBrandingV2Service } from './services/restaurant-branding-v2.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
import { AuthService } from '../auth/auth.service';
import { OwnerEmailVerificationService } from '../auth/services/owner-email-verification.service';
import { CallMeBotService } from '../notifications/callmebot.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { GoLiveReadinessService } from './services/go-live-readiness.service';
import { DemoActivationService } from '../demo-examples/demo-activation.service';

describe('RestaurantsController', () => {
  let controller: RestaurantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [
        { provide: RestaurantsService, useValue: {} },
        { provide: RestaurantUsersService, useValue: {} },
        { provide: RestaurantBrandingV2Service, useValue: {} },
        { provide: RestaurantSettingsService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: OwnerEmailVerificationService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: CallMeBotService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        {
          provide: PublicWriteAbuseService,
          useValue: { assertPublicWriteAllowed: jest.fn() },
        },
        { provide: GoLiveReadinessService, useValue: {} },
        { provide: DemoActivationService, useValue: {} },
        { provide: AdminAlertsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
