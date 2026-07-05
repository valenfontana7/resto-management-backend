import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ENGAGEMENT_OUTCOME_TYPES } from '../types/outcome.types';

export class RegisterOutcomeDto {
  @IsUUID()
  deliveryId!: string;

  @IsIn([...ENGAGEMENT_OUTCOME_TYPES])
  type!: (typeof ENGAGEMENT_OUTCOME_TYPES)[number];

  @IsOptional()
  rssAfter?: number | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
