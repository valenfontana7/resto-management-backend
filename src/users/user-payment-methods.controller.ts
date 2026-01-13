import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { UserPaymentMethodsService } from './user-payment-methods.service';

@ApiTags('users')
@Controller('api/users/me/payment-methods')
export class UserPaymentMethodsController {
  constructor(private readonly service: UserPaymentMethodsService) {}

  @Get()
  async list(@CurrentUser() user?: RequestUser) {
    return this.service.listForUser(user!.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user?: RequestUser,
    @Body() body?: { token?: string },
  ) {
    const token = (body?.token ?? '').trim();
    const u = {
      id: user!.userId,
      email: user!.email,
      name: (user as any).name ?? '',
      restaurantId: user!.restaurantId,
    };
    return this.service.createForUser(u, token);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user?: RequestUser, @Param('id') id?: string) {
    await this.service.deleteForUser(user!.userId, id!);
    return;
  }
}
