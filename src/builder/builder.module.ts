import { Module } from '@nestjs/common';
import { BuilderController } from './builder.controller';
import { BuilderPublicController } from './builder-public.controller';
import { BuilderService } from './builder.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BuilderController, BuilderPublicController],
  providers: [BuilderService],
  exports: [BuilderService],
})
export class BuilderModule {}
