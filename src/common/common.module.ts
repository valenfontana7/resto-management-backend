import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './services/ownership.service';
import { ImageProcessingService } from './services/image-processing.service';
import { RolesCatalogService } from './services/roles-catalog.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { RestaurantOwnerGuard } from './guards/restaurant-owner.guard';
import { ImageTransformInterceptor } from './interceptors/image-transform.interceptor';
import { BotDefenseService } from './services/bot-defense.service';
import { PublicWriteAbuseService } from './services/public-write-abuse.service';
import { OnboardingAiQuotaService } from './services/onboarding-ai-quota.service';
import { UploadQuotaService } from './services/upload-quota.service';
import { UploadOwnershipService } from './services/upload-ownership.service';

/**
 * Módulo global que provee servicios compartidos a toda la aplicación.
 * Al ser @Global(), no necesita ser importado en cada módulo.
 *
 * Servicios incluidos:
 * - OwnershipService: Verificación centralizada de permisos
 * - ImageProcessingService: Procesamiento unificado de imágenes
 *
 * Guards incluidos:
 * - RestaurantOwnerGuard: Verifica que el usuario pertenece al restaurante
 *
 * Interceptors incluidos:
 * - ImageTransformInterceptor: Transforma S3 keys a URLs públicas
 */
@Global()
@Module({
  imports: [PrismaModule, StorageModule],
  providers: [
    OwnershipService,
    ImageProcessingService,
    RolesCatalogService,
    RestaurantOwnerGuard,
    ImageTransformInterceptor,
    BotDefenseService,
    PublicWriteAbuseService,
    OnboardingAiQuotaService,
    UploadQuotaService,
    UploadOwnershipService,
  ],
  exports: [
    OwnershipService,
    ImageProcessingService,
    RolesCatalogService,
    RestaurantOwnerGuard,
    ImageTransformInterceptor,
    BotDefenseService,
    PublicWriteAbuseService,
    OnboardingAiQuotaService,
    UploadQuotaService,
    UploadOwnershipService,
  ],
})
export class CommonModule {}
