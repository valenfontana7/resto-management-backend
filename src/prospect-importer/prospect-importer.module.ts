import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProspectImporterService } from './prospect-importer.service';

@Module({
  imports: [PrismaModule],
  providers: [ProspectImporterService],
  exports: [ProspectImporterService],
})
export class ProspectImporterModule {}
