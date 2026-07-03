import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoLiveEnforcementService } from './services/go-live-enforcement.service';

@Module({
  imports: [PrismaModule],
  providers: [GoLiveEnforcementService],
  exports: [GoLiveEnforcementService],
})
export class GoLiveEnforcementModule {}
