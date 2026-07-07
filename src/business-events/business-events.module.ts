import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common/common.module';
import { BusinessMemoryModule } from '../business-memory/business-memory.module';
import { DecisionEngineModule } from '../decision-engine/decision-engine.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { BusinessEventBusService } from './business-event-bus.service';
import { BusinessEventMonitorService } from './business-event-monitor.service';
import { BusinessEventPublisherService } from './business-event-publisher.service';
import { BusinessEventRealtimeService } from './business-event-realtime.service';
import { BusinessEventReplayService } from './business-event-replay.service';
import { BusinessEventStoreService } from './business-event-store.service';
import { BusinessEventsController } from './business-events.controller';
import { BusinessMemoryEventSubscriber } from './subscribers/business-memory.subscriber';
import { InAppNotificationsEventSubscriber } from './subscribers/in-app-notifications.subscriber';
import { IntelligenceRefreshEventSubscriber } from './subscribers/intelligence-refresh.subscriber';
import { MenuBusinessEventsService } from './publishers/menu-business-events.service';
import { PaymentBusinessEventsService } from './publishers/payment-business-events.service';
import { MarketingBusinessEventsService } from './publishers/marketing-business-events.service';
import { DeliveryBusinessEventsService } from './publishers/delivery-business-events.service';
import { ReservationBusinessEventsService } from './publishers/reservation-business-events.service';
import { LoyaltyBusinessEventsService } from './publishers/loyalty-business-events.service';
import { BusinessEventDigestService } from './business-event-digest.service';

@Module({
  imports: [
    CommonModule,
    BusinessMemoryModule,
    DecisionEngineModule,
    forwardRef(() => NotificationsModule),
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
    InAppNotificationsEventSubscriber,
    IntelligenceRefreshEventSubscriber,
    MenuBusinessEventsService,
    PaymentBusinessEventsService,
    MarketingBusinessEventsService,
    DeliveryBusinessEventsService,
    ReservationBusinessEventsService,
    LoyaltyBusinessEventsService,
    BusinessEventDigestService,
  ],
  exports: [
    BusinessEventPublisherService,
    BusinessEventStoreService,
    MenuBusinessEventsService,
    PaymentBusinessEventsService,
    MarketingBusinessEventsService,
    DeliveryBusinessEventsService,
    ReservationBusinessEventsService,
    LoyaltyBusinessEventsService,
    BusinessEventDigestService,
  ],
})
export class BusinessEventsModule {}
