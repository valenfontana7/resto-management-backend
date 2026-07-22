import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { LAB_PROFILES } from '../bootstrap/lab-profile.types';

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

  /** minimal = online-only; ops-core = salón/caja/mesas HITL (default). */
  @IsOptional()
  @IsIn([...LAB_PROFILES])
  labProfile?: (typeof LAB_PROFILES)[number];
}
