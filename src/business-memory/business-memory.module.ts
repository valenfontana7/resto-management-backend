import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BusinessMemoryController } from './business-memory.controller';
import { BusinessMemoryService } from './business-memory.service';

@Module({
  imports: [CommonModule],
  controllers: [BusinessMemoryController],
  providers: [BusinessMemoryService],
  exports: [BusinessMemoryService],
})
export class BusinessMemoryModule {}
