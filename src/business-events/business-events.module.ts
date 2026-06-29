import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common/common.module';
import { BusinessMemoryModule } from '../business-memory/business-memory.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { BusinessEventBusService } from './business-event-bus.service';
import { BusinessEventMonitorService } from './business-event-monitor.service';
import { BusinessEventPublisherService } from './business-event-publisher.service';
import { BusinessEventRealtimeService } from './business-event-realtime.service';
import { BusinessEventReplayService } from './business-event-replay.service';
import { BusinessEventStoreService } from './business-event-store.service';
import { BusinessEventsController } from './business-events.controller';
import { BusinessMemoryEventSubscriber } from './subscribers/business-memory.subscriber';
import { MenuBusinessEventsService } from './publishers/menu-business-events.service';
import { PaymentBusinessEventsService } from './publishers/payment-business-events.service';
import { MarketingBusinessEventsService } from './publishers/marketing-business-events.service';

@Module({
  imports: [
    CommonModule,
    BusinessMemoryModule,
    WebsocketModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [BusinessEventsController],
  providers: [
    BusinessEventBusService,
    BusinessEventStoreService,
    BusinessEventPublisherService,
    BusinessEventReplayService,
    BusinessEventRealtimeService,
    BusinessEventMonitorService,
    BusinessMemoryEventSubscriber,
    MenuBusinessEventsService,
    PaymentBusinessEventsService,
    MarketingBusinessEventsService,
  ],
  exports: [
    BusinessEventPublisherService,
    BusinessEventStoreService,
    MenuBusinessEventsService,
    PaymentBusinessEventsService,
    MarketingBusinessEventsService,
  ],
})
export class BusinessEventsModule {}
