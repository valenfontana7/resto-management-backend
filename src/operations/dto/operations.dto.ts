import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CoordinationPriority,
  CoordinationType,
  OperationShiftSegment,
} from '@prisma/client';

export class ShiftAssignmentDto {
  @IsString()
  userId: string;

  @IsString()
  roleCode: string;

  @IsOptional()
  @IsString()
  stationId?: string;

  @IsArray()
  @IsString({ each: true })
  responsibilities: string[];
}

export class OpenShiftDto {
  @IsOptional()
  @IsEnum(OperationShiftSegment)
  segment?: OperationShiftSegment;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsISO8601()
  businessDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftAssignmentDto)
  assignments?: ShiftAssignmentDto[];
}

export class UpdateRosterDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftAssignmentDto)
  assignments: ShiftAssignmentDto[];
}

export class ContextRefDto {
  @IsString()
  type: string;

  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  deepLink?: string;
}

export class ParticipantDto {
  @IsString()
  targetType: string;

  @IsString()
  targetId: string;

  @IsString()
  participantRole: string;

  @IsOptional()
  ackRequired?: boolean;
}

export class OpenCoordinationDto {
  @IsEnum(CoordinationType)
  type: CoordinationType;

  @IsOptional()
  @IsEnum(CoordinationPriority)
  priority?: CoordinationPriority;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ContextRefDto)
  contextRef: ContextRefDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants: ParticipantDto[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  ackDeadlineMinutes?: number;
}

export class MeasuredImpactDto {
  @IsString()
  @MaxLength(80)
  metric: string;

  @IsOptional()
  @IsNumber()
  valueBefore?: number;

  @IsOptional()
  @IsNumber()
  valueAfter?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;
}

export class ResolveCoordinationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  outcome?: 'RESOLVED' | 'NO_EFFECT' | 'CANCELLED';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceKeys?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MeasuredImpactDto)
  measuredImpact?: MeasuredImpactDto;
}

export class RejectCoordinationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class Declare86Dto {
  @IsString()
  dishId: string;

  @IsString()
  @MaxLength(200)
  dishName: string;
}

export class DeclareIncidentDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ContextRefDto)
  contextRef?: ContextRefDto;

  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsEnum(CoordinationPriority)
  priority?: CoordinationPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceKeys?: string[];
}

export class RequestApprovalDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ContextRefDto)
  contextRef: ContextRefDto;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class HelpRequestDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  stationId?: string;
}

export class HandoffNoteDto {
  @IsString()
  @MaxLength(300)
  text: string;
}

export class PublishHandoffDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  transferredCoordinationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notes?: string[];
}

export class AcceptHandoffDto {
  @IsOptional()
  @IsString()
  toShiftId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acknowledgedSectionKinds?: string[];
}

export class OperationStationDto {
  @IsString()
  id: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  kind: string;

  @IsOptional()
  active?: boolean;
}

export class PutStationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationStationDto)
  stations: OperationStationDto[];
}

export class IntelligenceMoveTargetDto {
  @IsString()
  targetType: string;

  @IsString()
  targetId: string;
}

export class RouteIntelligenceMoveDto {
  @IsString()
  preparationId: string;

  @IsEnum(CoordinationType)
  type: CoordinationType;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(CoordinationPriority)
  priority?: CoordinationPriority;

  @IsOptional()
  @IsString()
  situationType?: string;

  @IsOptional()
  @IsString()
  situationId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => IntelligenceMoveTargetDto)
  target: IntelligenceMoveTargetDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ContextRefDto)
  contextRef?: ContextRefDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  ackDeadlineMinutes?: number;
}

class EscalationPriorityMinutesDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  CRITICAL?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  HIGH?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  NORMAL?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  LOW?: number;
}

export class PutEscalationConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => EscalationPriorityMinutesDto)
  ackDeadlineMinutesByPriority?: EscalationPriorityMinutesDto;

  @IsOptional()
  @IsBoolean()
  escalateCriticalImmediately?: boolean;
}

class OperationalRoutineTargetDto {
  @IsString()
  targetType: 'RESPONSIBILITY' | 'ROLE' | 'STATION';

  @IsString()
  targetId: string;
}

class OperationalRoutineDto {
  @IsString()
  @MaxLength(80)
  id: string;

  @IsBoolean()
  enabled: boolean;

  @IsIn([2, 3])
  autonomyLevel: 2 | 3;

  @IsString()
  trigger: 'SHIFT_OPENED' | 'SHIFT_CLOSING_STARTED';

  @IsEnum(CoordinationType)
  type: CoordinationType;

  @IsEnum(CoordinationPriority)
  priority: CoordinationPriority;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ValidateNested()
  @Type(() => OperationalRoutineTargetDto)
  target: OperationalRoutineTargetDto;
}

export class PutOperationalRoutinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationalRoutineDto)
  routines: OperationalRoutineDto[];
}

export class SimulateTacticDto {
  @IsString()
  @MaxLength(120)
  situationType: string;

  @IsString()
  @MaxLength(300)
  tacticSummary: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dayOfWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hour?: number;

  @IsOptional()
  @IsNumber()
  @Min(7)
  horizonDays?: number;
}
