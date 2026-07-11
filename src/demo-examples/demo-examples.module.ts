import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BuilderModule } from '../builder/builder.module';
import { ProspectImporterModule } from '../prospect-importer/prospect-importer.module';
import {
  MasterDemoExamplesController,
  PublicDemoExamplesController,
} from './demo-examples.controller';
import { DemoExamplesService } from './demo-examples.service';
import { DemoActivationService } from './demo-activation.service';

@Module({
  imports: [PrismaModule, BuilderModule, ProspectImporterModule],
  controllers: [PublicDemoExamplesController, MasterDemoExamplesController],
  providers: [DemoExamplesService, DemoActivationService],
  exports: [DemoExamplesService, DemoActivationService],
})
export class DemoExamplesModule {}
