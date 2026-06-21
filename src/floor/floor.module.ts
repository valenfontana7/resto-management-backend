import { Module, forwardRef } from '@nestjs/common';
import { FloorController } from './floor.controller';
import { TableSessionService } from './services/table-session.service';
import { CashRegisterService } from './services/cash-register.service';
import { FiscalDocumentService } from './services/fiscal-document.service';
import { FloorDiscountService } from './services/floor-discount.service';
import { TerminalService } from './services/terminal.service';
import { DailyOperationService } from './services/daily-operation.service';
import { MainCashRegisterService } from './services/main-cash-register.service';
import { FloorIdempotencyService } from './services/floor-idempotency.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { OrdersModule } from '../orders/orders.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { SalonDeliveryOrderService } from './services/salon-delivery-order.service';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    KitchenModule,
    FiscalModule,
    DeliveryModule,
    forwardRef(() => OrdersModule),
    RestaurantsModule,
  ],
  controllers: [FloorController],
  providers: [
    TableSessionService,
    CashRegisterService,
    FiscalDocumentService,
    FloorDiscountService,
    TerminalService,
    DailyOperationService,
    MainCashRegisterService,
    FloorIdempotencyService,
    SalonDeliveryOrderService,
  ],
  exports: [
    TableSessionService,
    CashRegisterService,
    FiscalDocumentService,
    TerminalService,
    DailyOperationService,
    MainCashRegisterService,
  ],
})
export class FloorModule {}
