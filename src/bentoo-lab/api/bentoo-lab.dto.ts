import {
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBentooLabRunDto {
  @IsString()
  @IsNotEmpty()
  scenarioId: string;

  @IsString()
  @IsNotEmpty()
  repetitionKey: string;

  @IsOptional()
  @IsISO8601()
  simulatedStartAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  incidentCodes?: string[];
}
