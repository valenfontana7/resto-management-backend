import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionTasksService } from './subscriptions-tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule, ScheduleModule.forRoot()],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionTasksService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
