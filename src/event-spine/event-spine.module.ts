import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
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
  imports: [PrismaModule, forwardRef(() => KitchenModule), WebsocketModule],
  providers: [
    OperationalOutboxPublisher,
    OperationalOutboxDispatcher,
    OperationalEventEmitter,
    OperationalEventHandlerRegistry,
    KitchenOperationalEventHandler,
    RealtimeOperationalEventHandler,
  ],
  exports: [
    OperationalOutboxPublisher,
    OperationalOutboxDispatcher,
    OperationalEventEmitter,
  ],
})
export class EventSpineModule implements OnModuleInit {
  constructor(
    private readonly registry: OperationalEventHandlerRegistry,
    private readonly kitchenHandler: KitchenOperationalEventHandler,
    private readonly realtimeHandler: RealtimeOperationalEventHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.kitchenHandler);
    this.registry.register(this.realtimeHandler);
  }
}
