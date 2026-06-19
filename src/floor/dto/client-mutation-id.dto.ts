import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Idempotencia para mutaciones encoladas offline del salón. */
export class ClientMutationIdDto {
  @ApiPropertyOptional({
    description:
      'ID único del cliente (cola offline) para deduplicar reintentos',
  })
  @IsOptional()
  @IsString()
  clientMutationId?: string;
}
