import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateOnboardingDraftDto } from './dto/generate-onboarding-draft.dto';
import { OnboardingAiService } from './onboarding-ai.service';

@ApiTags('Onboarding AI')
@Controller('api/onboarding-ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingAiController {
  constructor(private readonly onboardingAiService: OnboardingAiService) {}

  @Post('generate-draft')
  @ApiOperation({
    summary: 'Generate an onboarding draft from a natural language prompt',
  })
  @ApiResponse({ status: 201, description: 'Draft generated successfully.' })
  async generateDraft(@Body() dto: GenerateOnboardingDraftDto) {
    const draft = await this.onboardingAiService.generateDraft(dto);
    return { draft };
  }
}
