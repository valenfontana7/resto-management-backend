import {
  Controller,
  Get,
  Param,
  Sse,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { KitchenNotificationsService } from './kitchen-notifications.service';

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('api/restaurants/:restaurantId/kitchen')
export class KitchenController {
  constructor(
    private jwtService: JwtService,
    private kitchenNotifications: KitchenNotificationsService,
  ) {}

  @Get('notifications')
  @Sse()
  @Public()
  async notifications(
    @Param('restaurantId') restaurantId: string,
    @Req() req: any,
  ): Promise<Observable<MessageEvent>> {
    // Validar token manualmente antes de establecer conexión SSE
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Se requiere token de autenticación en header Authorization',
      );
    }

    const token = authHeader.substring(7);

    try {
      // Verificar el token
      const payload = await this.jwtService.verifyAsync(token);

      // Validar que el usuario tenga acceso al restaurante
      if (
        payload.restaurantId !== restaurantId &&
        payload.roleName !== 'SUPER_ADMIN'
      ) {
        throw new UnauthorizedException(
          'No tienes acceso a las notificaciones de este restaurante',
        );
      }

      console.log(
        `✅ Conexión SSE autorizada para restaurante ${restaurantId} - Usuario: ${payload.email}`,
      );

      return this.kitchenNotifications.getNotificationsForRestaurant(
        restaurantId,
      );
    } catch (error) {
      console.error('❌ Error al verificar token SSE:', error.message);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
