import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { AfipWsaaService } from './services/afip-wsaa.service';
import { AfipWsfeService } from './services/afip-wsfe.service';
import { AfipPadronService } from './services/afip-padron.service';
import { FiscalConfigService } from './services/fiscal-config.service';
import { AfipAuthorizationService } from './services/afip-authorization.service';
import { FiscalPdfService } from './services/fiscal-pdf.service';

@Module({
  imports: [PrismaModule, ConfigModule, MercadoPagoModule],
  providers: [
    AfipWsaaService,
    AfipWsfeService,
    AfipPadronService,
    FiscalConfigService,
    AfipAuthorizationService,
    FiscalPdfService,
  ],
  exports: [
    FiscalConfigService,
    AfipAuthorizationService,
    AfipPadronService,
    FiscalPdfService,
  ],
})
export class FiscalModule {}
