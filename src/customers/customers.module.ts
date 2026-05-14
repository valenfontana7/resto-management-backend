import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { CustomersController } from './customers.controller';
import { CustomersPublicController } from './customers-public.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [EmailModule],
  controllers: [CustomersController, CustomersPublicController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
