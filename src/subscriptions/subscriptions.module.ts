import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { UserSubscriptionController } from './user-subscription.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionResolverService } from './subscription-resolver.service';
import { SubscriptionTasksService } from './subscriptions-tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { AuthModule } from '../auth/auth.module';
import { PlansModule } from './plans/plans.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    EmailModule,
    MercadoPagoModule,
    AuthModule,
    PlansModule,
  ],
  controllers: [SubscriptionsController, UserSubscriptionController],
  providers: [
    SubscriptionsService,
    SubscriptionResolverService,
    SubscriptionTasksService,
  ],
  exports: [SubscriptionsService, SubscriptionResolverService, PlansModule],
})
export class SubscriptionsModule {}
