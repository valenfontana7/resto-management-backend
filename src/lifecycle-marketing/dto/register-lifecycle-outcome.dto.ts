import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import type { LifecycleOutcomeType } from '../types/delivery.types';

const OUTCOME_TYPES = [
  'SENT',
  'OPENED',
  'CLICKED',
  'REPLIED',
  'GOAL_COMPLETED',
  'IGNORED',
  'UNSUBSCRIBED',
  'RSS_CONTRIBUTION',
  'JOURNEY_COMPLETED',
] as const;

export class RegisterLifecycleOutcomeDto {
  @IsString()
  deliveryId!: string;

  @IsEnum(OUTCOME_TYPES)
  type!: LifecycleOutcomeType;

  @IsOptional()
  rssAfter?: number | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
