import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { GenerateMenuDraftDto } from './dto/generate-menu-draft.dto';
import { GenerateOnboardingDraftDto } from './dto/generate-onboarding-draft.dto';
import { OnboardingAiService } from './onboarding-ai.service';
import { OnboardingAiQuotaService } from '../common/services/onboarding-ai-quota.service';

@ApiTags('Onboarding AI')
@Controller('api/onboarding-ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingAiController {
  constructor(
    private readonly onboardingAiService: OnboardingAiService,
    private readonly onboardingAiQuota: OnboardingAiQuotaService,
  ) {}

  @Post('generate-draft')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Generate an onboarding draft from a natural language prompt',
  })
  @ApiResponse({ status: 201, description: 'Draft generated successfully.' })
  async generateDraft(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateOnboardingDraftDto,
  ) {
    await this.onboardingAiQuota.assertUserQuota(user.userId, 'draft');
    const draft = await this.onboardingAiService.generateDraft(dto);
    return { draft };
  }

  @Post('generate-menu-draft')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Generate a menu draft (categories and dishes) from a natural language prompt',
  })
  @ApiResponse({
    status: 201,
    description: 'Menu draft generated successfully.',
  })
  async generateMenuDraft(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateMenuDraftDto,
  ) {
    await this.onboardingAiQuota.assertUserQuota(user.userId, 'menu');
    const draft = await this.onboardingAiService.generateMenuDraft(dto);
    return { draft };
  }
}
