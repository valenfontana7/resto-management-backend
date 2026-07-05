import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrossEngineFrequencyService } from './cross-engine-frequency.service';

@Module({
  imports: [PrismaModule],
  providers: [CrossEngineFrequencyService],
  exports: [CrossEngineFrequencyService],
})
export class OwnerCommunicationsModule {}
