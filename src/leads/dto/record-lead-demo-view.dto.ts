import { IsString, MaxLength, MinLength } from 'class-validator';

export class RecordLeadDemoViewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  slug!: string;
}
