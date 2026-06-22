import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalonDesktopController } from './salon-desktop.controller';
import { SalonDesktopAdminController } from './salon-desktop-admin.controller';
import { SalonDesktopService } from './salon-desktop.service';
import { SalonDesktopFleetService } from './salon-desktop-fleet.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalonDesktopController, SalonDesktopAdminController],
  providers: [SalonDesktopService, SalonDesktopFleetService],
  exports: [SalonDesktopService, SalonDesktopFleetService],
})
export class SalonDesktopModule {}
