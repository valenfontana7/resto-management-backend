import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class EnqueueAiTaskDto {
  @IsString()
  taskKey: string;

  @IsObject()
  input: Record<string, unknown>;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  savedSearchId?: string;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  runImmediately?: boolean;
}

export class ScheduleAiTaskDto {
  @IsString()
  scheduledAt: string;
}
