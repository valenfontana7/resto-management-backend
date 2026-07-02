import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  title: string;

  @IsString()
  objective: string;

  @IsOptional()
  @IsString()
  goalType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  targetCount?: number;

  @IsOptional()
  @IsNumber()
  budgetUsd?: number;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  priorities?: Record<string, number>;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsNumber()
  targetCount?: number;

  @IsOptional()
  @IsNumber()
  budgetUsd?: number;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  priorities?: Record<string, number>;
}

export class UpdatePlanStepDto {
  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  selectedModel?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  removed?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  steps?: Array<{ stepId: string } & UpdatePlanStepDto>;
}
