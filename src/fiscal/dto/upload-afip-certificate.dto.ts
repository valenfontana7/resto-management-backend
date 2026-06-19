import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadAfipCertificateDto {
  @ApiProperty({ description: 'Certificado fiscal ARCA en formato PEM (.crt)' })
  @IsString()
  @IsNotEmpty()
  certificatePem: string;

  @ApiProperty({ description: 'Clave privada en formato PEM (.key)' })
  @IsString()
  @IsNotEmpty()
  privateKeyPem: string;
}
