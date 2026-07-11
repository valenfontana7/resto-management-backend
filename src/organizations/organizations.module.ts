import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationBootstrapService } from './organization-bootstrap.service';

@Module({
  imports: [PrismaModule],
  providers: [OrganizationBootstrapService],
  exports: [OrganizationBootstrapService],
})
export class OrganizationsModule {}
