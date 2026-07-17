import { Module, OnModuleInit } from '@nestjs/common';

import { DecisionEngineModule } from '../decision-engine/decision-engine.module';

import { OwnerCommunicationsModule } from '../owner-communications/owner-communications.module';

import { EmailModule } from '../email/email.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { PrismaModule } from '../prisma/prisma.module';

import { CustomerEngagementController } from './customer-engagement.controller';

import { EngagementWebhooksController } from './engagement-webhooks.controller';

import { EngagementPolicyRegistry } from './policies/engagement-policy.registry';

import { EngagementEngineService } from './services/engagement-engine.service';

import { EngagementContextLoader } from './services/engagement-context.loader';

import { JourneySelector } from './services/journey-selector.service';

import { ChannelSelector } from './services/channel-selector.service';

import { TemplateSelector } from './services/template-selector.service';

import { PersonalizationEngine } from './services/personalization-engine.service';

import { DeliveryScheduler } from './services/delivery-scheduler.service';

import { OutcomeTracker } from './services/outcome-tracker.service';

import { ActiveJourneyService } from './services/active-journey.service';

import { EngagementDeliveryProcessorService } from './services/engagement-delivery-processor.service';

import { RestaurantRefResolverService } from './services/restaurant-ref-resolver.service';

import { JourneyStepSchedulerService } from './services/journey-step-scheduler.service';

import { EngagementCronService } from './services/engagement-cron.service';

import { ResendEngagementWebhookService } from './services/resend-engagement-webhook.service';

import { EngagementPersistenceService } from './stores/engagement-persistence.service';

import {
  CsTaskChannelAdapter,
  EmailChannelAdapter,
  InAppChannelAdapter,
  PushChannelAdapter,
  WhatsAppChannelAdapter,
} from './channels/channel.adapters';

@Module({
  imports: [
    OwnerCommunicationsModule,

    DecisionEngineModule,

    PrismaModule,

    EmailModule,

    NotificationsModule,
  ],

  controllers: [CustomerEngagementController, EngagementWebhooksController],

  providers: [
    EngagementPersistenceService,

    EngagementPolicyRegistry,

    EngagementContextLoader,

    JourneySelector,

    ChannelSelector,

    TemplateSelector,

    PersonalizationEngine,

    DeliveryScheduler,

    OutcomeTracker,

    ActiveJourneyService,

    EngagementDeliveryProcessorService,

    JourneyStepSchedulerService,

    EngagementCronService,

    ResendEngagementWebhookService,

    EngagementEngineService,

    RestaurantRefResolverService,

    EmailChannelAdapter,

    WhatsAppChannelAdapter,

    InAppChannelAdapter,

    PushChannelAdapter,

    CsTaskChannelAdapter,
  ],

  exports: [
    EngagementEngineService,
    EngagementPersistenceService,
    OutcomeTracker,
    ActiveJourneyService,
    RestaurantRefResolverService,
  ],
})
export class CustomerEngagementModule implements OnModuleInit {
  constructor(
    private readonly deliveryScheduler: DeliveryScheduler,

    private readonly emailAdapter: EmailChannelAdapter,

    private readonly whatsappAdapter: WhatsAppChannelAdapter,

    private readonly inAppAdapter: InAppChannelAdapter,

    private readonly pushAdapter: PushChannelAdapter,

    private readonly csTaskAdapter: CsTaskChannelAdapter,
  ) {}

  onModuleInit(): void {
    for (const adapter of [
      this.emailAdapter,

      this.whatsappAdapter,

      this.inAppAdapter,

      this.pushAdapter,

      this.csTaskAdapter,
    ]) {
      this.deliveryScheduler.registerAdapter(adapter);
    }
  }
}
