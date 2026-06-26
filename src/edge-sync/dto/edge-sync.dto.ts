import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EdgeRegisterDto {
  @IsOptional()
  @IsString()
  localId?: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsString()
  version?: string;
}

export class EdgeHeartbeatDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  lanUrl?: string;

  @IsOptional()
  @IsString()
  hostname?: string;
}

export class EdgeSyncPullQueryDto {
  @IsOptional()
  @IsString()
  streams?: string;

  @IsOptional()
  @IsString()
  since?: string;
}

export class EdgeSyncMutationDto {
  @IsString()
  clientMutationId!: string;

  @IsString()
  entityType!: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class EdgeSyncPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EdgeSyncMutationDto)
  mutations!: EdgeSyncMutationDto[];
}
