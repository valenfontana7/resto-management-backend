import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  MasterDemoExamplesController,
  PublicDemoExamplesController,
} from './demo-examples.controller';
import { DemoExamplesService } from './demo-examples.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicDemoExamplesController, MasterDemoExamplesController],
  providers: [DemoExamplesService],
  exports: [DemoExamplesService],
})
export class DemoExamplesModule {}
