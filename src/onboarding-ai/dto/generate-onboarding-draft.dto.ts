import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateOnboardingDraftDto {
  @ApiProperty({
    description:
      'Natural language description of the restaurant to bootstrap the onboarding draft.',
    example:
      'Tengo una pizzeria llamada Fuego y Masa en Palermo. Hacemos pizza napolitana, empanadas y postres. Abrimos de martes a domingo de 12 a 23. Hacemos delivery en Palermo y Villa Crespo.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  prompt: string;
}
