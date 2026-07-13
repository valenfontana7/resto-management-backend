import { IsIn, IsOptional } from 'class-validator';
import { OPERATIONAL_EXPERIENCE_PROFILE_IDS } from '../experience.types';

export class PatchExperienceProfileDto {
  @IsIn([...OPERATIONAL_EXPERIENCE_PROFILE_IDS])
  profileId!: (typeof OPERATIONAL_EXPERIENCE_PROFILE_IDS)[number];

  @IsOptional()
  clearOverride?: boolean;
}
