import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  NotificationsService,
  NotificationFilters,
} from './notifications.service';
import { Notification, NotificationType } from '@prisma/client';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener notificaciones del usuario' })
  @ApiResponse({ status: 200, description: 'Lista de notificaciones' })
  @ApiQuery({ name: 'restaurantId', required: false, type: String })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getUserNotifications(
    @Request() req: any,
    @Query('restaurantId') restaurantId?: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: NotificationType,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Notification[]> {
    const filters: NotificationFilters = {
      userId: req.user?.userId,
      restaurantId,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      type,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    };

    return this.notificationsService.getUserNotifications(filters);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Obtener conteo de notificaciones no leídas' })
  @ApiResponse({
    status: 200,
    description: 'Conteo de notificaciones no leídas',
  })
  async getUnreadCount(
    @Request() req: any,
    @Query('restaurantId') restaurantId?: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnreadCount(
      req.user.userId,
      restaurantId,
    );
    return { count };
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) notificationId: string,
    @Request() req: any,
  ): Promise<Notification> {
    return this.notificationsService.markAsRead(
      notificationId,
      req.user.userId,
    );
  }

  @Put('mark-all-read')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiResponse({
    status: 200,
    description: 'Número de notificaciones marcadas como leídas',
  })
  async markAllAsRead(
    @Request() req: any,
    @Query('restaurantId') restaurantId?: string,
  ): Promise<{ markedCount: number }> {
    const markedCount = await this.notificationsService.markAllAsRead(
      req.user.userId,
      restaurantId,
    );
    return { markedCount };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar notificación' })
  @ApiResponse({ status: 200, description: 'Notificación eliminada' })
  async deleteNotification(
    @Param('id', ParseUUIDPipe) notificationId: string,
    @Request() req: any,
  ): Promise<void> {
    return this.notificationsService.deleteNotification(
      notificationId,
      req.user.userId,
    );
  }
}
