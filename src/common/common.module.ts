import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './services/ownership.service';
import { ImageProcessingService } from './services/image-processing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { RestaurantOwnerGuard } from './guards/restaurant-owner.guard';
import { ImageTransformInterceptor } from './interceptors/image-transform.interceptor';

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
    RestaurantOwnerGuard,
    ImageTransformInterceptor,
  ],
  exports: [
    OwnershipService,
    ImageProcessingService,
    RestaurantOwnerGuard,
    ImageTransformInterceptor,
  ],
})
export class CommonModule {}
