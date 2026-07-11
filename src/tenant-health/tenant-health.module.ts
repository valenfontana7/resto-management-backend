import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantHealthService } from './tenant-health.service';
import { TenantHealthController } from './tenant-health.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TenantHealthController],
  providers: [TenantHealthService],
  exports: [TenantHealthService],
})
export class TenantHealthModule {}
