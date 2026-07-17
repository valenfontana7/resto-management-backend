import { IsBoolean } from 'class-validator';

export class SetLifecycleCampaignPausedDto {
  @IsBoolean()
  paused!: boolean;
}
