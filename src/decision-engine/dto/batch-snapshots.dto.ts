import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CommercialRelationStage } from '@prisma/client';

const LIFECYCLE_STAGES: CommercialRelationStage[] = [
  'DISCOVERED',
  'LEAD',
  'LEAD_ENRICHED',
  'LEAD_QUALIFIED',
  'FIRST_CONTACT',
  'INTERESTED',
  'DEMO_REQUESTED',
  'DEMO_DONE',
  'FOLLOW_UP',
  'TRIAL',
  'CLIENT',
  'ACTIVE_CLIENT',
  'ADVANCED_CLIENT',
  'PROMOTER',
  'RECOVERY',
];

export class BatchSnapshotItemDto {
  @IsString()
  restaurantId!: string;

  @IsOptional()
  @IsIn(LIFECYCLE_STAGES)
  lifecycleStage?: CommercialRelationStage;
}

export class BatchSnapshotsDto {
  /** Preferido: IDs con lifecycle real por restaurante. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchSnapshotItemDto)
  items?: BatchSnapshotItemDto[];

  /** Compat legacy: todos se tratan como CLIENT si no hay items. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  restaurantIds?: string[];

  @IsOptional()
  evaluateIfMissing?: boolean;

  @IsOptional()
  refreshStale?: boolean;
}
