import { Module } from '@nestjs/common';
import { BuilderController } from './builder.controller';
import { BuilderPublicController } from './builder-public.controller';
import { BuilderService } from './builder.service';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { GoLiveEnforcementModule } from '../restaurants/go-live-enforcement.module';

@Module({
  imports: [
    AuthModule,
    CommonModule,
    BusinessEventsModule,
    GoLiveEnforcementModule,
  ],
  controllers: [BuilderController, BuilderPublicController],
  providers: [BuilderService],
  exports: [BuilderService],
})
export class BuilderModule {}
