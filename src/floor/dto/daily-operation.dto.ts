import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateDailyOperationDto {
  @IsOptional()
  @IsString()
  dailyGoal?: string;

  @IsOptional()
  @IsObject()
  openingChecklist?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  openingNotes?: string;

  @IsOptional()
  @IsBoolean()
  openingCompleted?: boolean;

  @IsOptional()
  @IsObject()
  closingChecklist?: Record<string, boolean>;

  @IsOptional()
  @IsString()
  closingNotes?: string;

  @IsOptional()
  @IsBoolean()
  closingCompleted?: boolean;
}

export const OPENING_CHECKLIST_IDS = [
  'open_cash',
  'review_reservations',
  'briefing_team',
  'check_printers',
  'verify_menu',
] as const;

export const CLOSING_CHECKLIST_IDS = [
  'close_tables',
  'cash_count',
  'close_cash',
  'close_daily',
  'review_kitchen',
  'tomorrow_prep',
] as const;

export type OpeningChecklistId = (typeof OPENING_CHECKLIST_IDS)[number];
export type ClosingChecklistId = (typeof CLOSING_CHECKLIST_IDS)[number];
