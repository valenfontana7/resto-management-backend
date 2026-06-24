import { IsOptional, IsString } from 'class-validator';
import { ApiHideProperty } from '@nestjs/swagger';

/**
 * Campos opcionales anti-bot para formularios públicos.
 * - companyWebsite: honeypot (debe permanecer vacío)
 * - turnstileToken: Cloudflare Turnstile (si TURNSTILE_SECRET_KEY está configurado)
 */
export class BotDefenseDto {
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  companyWebsite?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
