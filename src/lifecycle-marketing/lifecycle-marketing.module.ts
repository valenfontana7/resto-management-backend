import { Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DecisionEngineModule } from '../decision-engine/decision-engine.module';
import { OwnerCommunicationsModule } from '../owner-communications/owner-communications.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LifecycleMarketingController } from './lifecycle-marketing.controller';
import { CampaignRegistry } from './services/campaign-registry.service';
import { EligibilityEngine } from './services/eligibility-engine.service';
import { FrequencyEngine } from './services/frequency-engine.service';
import { CampaignEvaluator } from './services/campaign-evaluator.service';
import { TemplateResolver } from './services/template-resolver.service';
import { PersonalizationResolver } from './services/personalization-resolver.service';
import { CampaignScheduler } from './services/campaign-scheduler.service';
import { OutcomeCollector } from './services/outcome-collector.service';
import { LifecycleContextLoader } from './services/lifecycle-context.loader';
import { LifecycleDeliveryProcessorService } from './services/lifecycle-delivery-processor.service';
import { CampaignStepSchedulerService } from './services/campaign-step-scheduler.service';
import { LifecycleCronService } from './services/lifecycle-cron.service';
import { LifecycleMarketingService } from './services/lifecycle-marketing.service';
import { TemplateOverrideService } from './services/template-override.service';
import { MarketingDirectorService } from './services/marketing-director.service';
import { LifecyclePersistenceService } from './stores/lifecycle-persistence.service';
import {
  LifecycleCsTaskChannelAdapter,
  LifecycleEmailChannelAdapter,
  LifecycleInAppChannelAdapter,
  LifecyclePushChannelAdapter,
  LifecycleWhatsAppChannelAdapter,
} from './channels/lifecycle-channel.adapters';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    OwnerCommunicationsModule,
    DecisionEngineModule,
    PrismaModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [LifecycleMarketingController],
  providers: [
    LifecyclePersistenceService,
    CampaignRegistry,
    EligibilityEngine,
    FrequencyEngine,
    CampaignEvaluator,
    TemplateResolver,
    TemplateOverrideService,
    MarketingDirectorService,
    PersonalizationResolver,
    CampaignScheduler,
    OutcomeCollector,
    LifecycleContextLoader,
    LifecycleDeliveryProcessorService,
    CampaignStepSchedulerService,
    LifecycleCronService,
    LifecycleMarketingService,
    LifecycleEmailChannelAdapter,
    LifecycleWhatsAppChannelAdapter,
    LifecycleInAppChannelAdapter,
    LifecyclePushChannelAdapter,
    LifecycleCsTaskChannelAdapter,
  ],
  exports: [
    LifecycleMarketingService,
    LifecyclePersistenceService,
    OutcomeCollector,
    MarketingDirectorService,
    TemplateOverrideService,
  ],
})
export class LifecycleMarketingModule implements OnModuleInit {
  constructor(
    private readonly deliveryProcessor: LifecycleDeliveryProcessorService,
    private readonly emailAdapter: LifecycleEmailChannelAdapter,
    private readonly whatsappAdapter: LifecycleWhatsAppChannelAdapter,
    private readonly inAppAdapter: LifecycleInAppChannelAdapter,
    private readonly pushAdapter: LifecyclePushChannelAdapter,
    private readonly csTaskAdapter: LifecycleCsTaskChannelAdapter,
  ) {}

  onModuleInit(): void {
    for (const adapter of [
      this.emailAdapter,
      this.whatsappAdapter,
      this.inAppAdapter,
      this.pushAdapter,
      this.csTaskAdapter,
    ]) {
      this.deliveryProcessor.registerAdapter(adapter);
    }
  }
}
