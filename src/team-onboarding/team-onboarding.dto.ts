import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  roleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  ttlHours?: number;
}

export class RedeemTeamInviteDto {
  @IsString()
  inviteId!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  pin!: string;
}
