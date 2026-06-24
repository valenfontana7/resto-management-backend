import { Module } from '@nestjs/common';
import { BuilderController } from './builder.controller';
import { BuilderPublicController } from './builder-public.controller';
import { BuilderService } from './builder.service';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [BuilderController, BuilderPublicController],
  providers: [BuilderService],
  exports: [BuilderService],
})
export class BuilderModule {}
