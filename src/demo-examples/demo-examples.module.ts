import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BuilderModule } from '../builder/builder.module';
import {
  MasterDemoExamplesController,
  PublicDemoExamplesController,
} from './demo-examples.controller';
import { DemoExamplesService } from './demo-examples.service';
import { DemoActivationService } from './demo-activation.service';

@Module({
  imports: [PrismaModule, BuilderModule],
  controllers: [PublicDemoExamplesController, MasterDemoExamplesController],
  providers: [DemoExamplesService, DemoActivationService],
  exports: [DemoExamplesService, DemoActivationService],
})
export class DemoExamplesModule {}
