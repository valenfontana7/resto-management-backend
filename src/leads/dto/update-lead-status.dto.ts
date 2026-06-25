import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status: LeadStatus;
}
