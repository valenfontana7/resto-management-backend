import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DecisionEngineModule } from '../decision-engine/decision-engine.module';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReflexLoopService } from './reflex-loop.service';
import { TenantBriefingController } from './tenant-briefing.controller';

@Module({
  imports: [
    PrismaModule,
    DecisionEngineModule,
    OperationsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [TenantBriefingController],
  providers: [ReflexLoopService],
  exports: [ReflexLoopService],
})
export class OperationalBrainModule {}
