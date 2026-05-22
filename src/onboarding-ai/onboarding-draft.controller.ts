import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { OnboardingDraftService } from './onboarding-draft.service';

@ApiTags('Onboarding Draft')
@Controller('api/onboarding/draft')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingDraftController {
  constructor(private readonly draftService: OnboardingDraftService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener el draft de onboarding del usuario actual',
  })
  @ApiResponse({ status: 200, description: 'Draft o null si no existe' })
  async get(@CurrentUser() user: RequestUser) {
    const draft = await this.draftService.get(user.userId);
    return { draft };
  }

  @Put()
  @ApiOperation({ summary: 'Guardar/actualizar el draft de onboarding' })
  @ApiResponse({ status: 200, description: 'Draft persistido' })
  async upsert(
    @CurrentUser() user: RequestUser,
    @Body() body: { data: Record<string, unknown> },
  ) {
    const draft = await this.draftService.upsert(
      user.userId,
      (body?.data ?? {}) as any,
    );
    return { draft };
  }

  @Delete()
  @ApiOperation({ summary: 'Borrar el draft de onboarding' })
  @ApiResponse({ status: 200, description: 'Draft eliminado' })
  async remove(@CurrentUser() user: RequestUser) {
    return this.draftService.remove(user.userId);
  }
}
