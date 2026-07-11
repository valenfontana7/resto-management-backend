import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { OperationalOutboxPublisher } from './operational-outbox.publisher';
import { OperationalOutboxDispatcher } from './operational-outbox.dispatcher';
import { OperationalEventEmitter } from './operational-event-emitter.service';
import { OperationalEventHandlerRegistry } from './operational-event-handler.registry';
import { KitchenOperationalEventHandler } from './handlers/kitchen-operational.handler';
import { RealtimeOperationalEventHandler } from './handlers/realtime-operational.handler';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    forwardRef(() => KitchenModule),
    WebsocketModule,
  ],
  providers: [
    OperationalOutboxPublisher,
    OperationalOutboxDispatcher,
    OperationalEventEmitter,
    OperationalEventHandlerRegistry,
    KitchenOperationalEventHandler,
    RealtimeOperationalEventHandler,
    {
      provide: 'EVENT_SPINE_INIT',
      useFactory: (
        registry: OperationalEventHandlerRegistry,
        kitchen: KitchenOperationalEventHandler,
        realtime: RealtimeOperationalEventHandler,
      ) => {
        registry.register(kitchen);
        registry.register(realtime);
        return true;
      },
      inject: [
        OperationalEventHandlerRegistry,
        KitchenOperationalEventHandler,
        RealtimeOperationalEventHandler,
      ],
    },
  ],
  exports: [
    OperationalOutboxPublisher,
    OperationalOutboxDispatcher,
    OperationalEventEmitter,
  ],
})
export class EventSpineModule implements OnModuleInit {
  onModuleInit(): void {
    // Handlers registered via EVENT_SPINE_INIT factory
  }
}
