import { IsBoolean } from 'class-validator';

export class ToggleTrialDto {
  @IsBoolean()
  enableTrial: boolean;
}
