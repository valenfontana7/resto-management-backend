import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanDto } from './create-plan.dto';
import { IsOptional } from 'class-validator';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional()
  id?: string;
}
