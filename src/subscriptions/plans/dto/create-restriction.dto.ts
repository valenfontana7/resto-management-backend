import { IsString, IsOptional } from 'class-validator';

export class CreateRestrictionDto {
  @IsString()
  key: string;

  @IsString()
  type: string; // 'limit' | 'boolean' | 'text'

  @IsString()
  value: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category: string; // 'limits' | 'features' | 'integrations' | 'support'
}
