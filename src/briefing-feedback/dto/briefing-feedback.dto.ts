import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { BriefingFeedbackKind } from '@prisma/client';

export class RecordBriefingFeedbackDto {
  @IsString()
  preparationId: string;

  @IsEnum(BriefingFeedbackKind)
  kind: BriefingFeedbackKind;

  /** Requerido cuando kind es SNOOZED. */
  @IsOptional()
  @IsISO8601()
  snoozedUntil?: string;
}
