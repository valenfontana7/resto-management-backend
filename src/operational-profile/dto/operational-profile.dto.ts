import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  BusinessPriority,
  FocusArea,
  OperationalModel,
} from '../operational-profile.types';

const OPERATIONAL_MODELS = ['digital', 'salon', 'mixed'] as const;
const FOCUS_AREAS = [
  'order_fulfillment',
  'delivery_logistics',
  'web_channel',
  'floor_service',
  'reservations',
  'cash_control',
  'revenue_growth',
] as const;
const PRIORITIES = [
  'speed',
  'salon_experience',
  'sales_growth',
  'margin',
  'team_coordination',
  'reliability',
] as const;

class BusinessPrioritiesDto {
  @IsIn(PRIORITIES)
  primary!: BusinessPriority;

  @IsOptional()
  @IsIn(PRIORITIES)
  secondary?: BusinessPriority;
}

export class UpdateOperationalProfileDto {
  @IsOptional()
  @IsIn(OPERATIONAL_MODELS)
  operationalModel?: OperationalModel;

  @IsOptional()
  @IsArray()
  @IsIn(FOCUS_AREAS, { each: true })
  focusAreas?: FocusArea[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPrioritiesDto)
  businessPriorities?: BusinessPrioritiesDto;
}

export class OperationalProfileWizardStepDto {
  @IsString()
  stepId!: string;

  @IsOptional()
  @IsIn(OPERATIONAL_MODELS)
  operationalModel?: OperationalModel;

  @IsOptional()
  @IsIn(FOCUS_AREAS)
  startFocus?: FocusArea;

  @IsOptional()
  @IsArray()
  @IsIn(FOCUS_AREAS, { each: true })
  focusAreas?: FocusArea[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPrioritiesDto)
  businessPriorities?: BusinessPrioritiesDto;
}

export class CompleteOperationalProfileWizardDto {
  @IsOptional()
  @IsIn(OPERATIONAL_MODELS)
  operationalModel?: OperationalModel;

  @IsOptional()
  @IsIn(FOCUS_AREAS)
  startFocus?: FocusArea;

  @IsOptional()
  @IsArray()
  @IsIn(FOCUS_AREAS, { each: true })
  focusAreas?: FocusArea[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessPrioritiesDto)
  businessPriorities?: BusinessPrioritiesDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completedStepIds?: string[];
}

export class ResetOperationalProfileDto {
  @IsOptional()
  @IsString()
  confirm?: string;
}
