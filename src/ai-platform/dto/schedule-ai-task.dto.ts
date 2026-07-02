import { IsString } from 'class-validator';

export class ScheduleAiTaskDto {
  @IsString()
  scheduledAt: string;
}
