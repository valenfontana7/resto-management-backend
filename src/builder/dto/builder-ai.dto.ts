import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const BUILDER_AI_COPY_FIELDS = [
  'hero.title',
  'hero.subtitle',
  'hero.cta',
  'about.body',
  'about.title',
  'cta.title',
  'cta.subtitle',
  'cta.button',
  'featured.title',
  'testimonials.title',
  'faq.title',
  'gallery.title',
  'hours.title',
  'map.title',
  'richText.title',
  'richText.body',
  'block.title',
  'block.subtitle',
  'block.body',
  'block.cta',
] as const;

export type BuilderAiCopyField = (typeof BUILDER_AI_COPY_FIELDS)[number];

export const BUILDER_AI_COMPOSE_INTENTS = [
  'order-online',
  'reserve-table',
  'brand-menu',
  'delivery-push',
] as const;

export type BuilderAiComposeIntent =
  (typeof BUILDER_AI_COMPOSE_INTENTS)[number];

export class ImproveBuilderCopyDto {
  @ApiProperty({
    description: 'Campo de copy a mejorar',
    enum: BUILDER_AI_COPY_FIELDS,
  })
  @IsString()
  @IsIn(BUILDER_AI_COPY_FIELDS as unknown as string[])
  field!: BuilderAiCopyField;

  @ApiPropertyOptional({ description: 'Texto actual del campo' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentText?: string;

  @ApiPropertyOptional({
    description: 'Tono deseado (ej. cercano, premium, urgente)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tone?: string;

  @ApiPropertyOptional({
    description: 'Contexto del restaurante (nombre, ciudad, tipo, etc.)',
  })
  @IsOptional()
  @IsObject()
  restaurantContext?: Record<string, unknown>;
}

export class ComposeHomeDto {
  @ApiProperty({
    description: 'Intención de la home',
    enum: BUILDER_AI_COMPOSE_INTENTS,
  })
  @IsString()
  @IsIn(BUILDER_AI_COMPOSE_INTENTS as unknown as string[])
  intent!: BuilderAiComposeIntent;
}
