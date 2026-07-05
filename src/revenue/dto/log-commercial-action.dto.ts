import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const QUICK_LOG_RESULTS = [
  'responded',
  'no_answer',
  'demo_booked',
  'stage_advanced',
  'discarded',
] as const;

export class LogCommercialActionDto {
  @IsIn(QUICK_LOG_RESULTS)
  result!: (typeof QUICK_LOG_RESULTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
