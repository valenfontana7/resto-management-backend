import { IsString, IsEmail, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRestaurantDto {
  @ApiProperty({
    description: 'Restaurant name',
    example: 'Don Cangrejo',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Restaurant email',
    example: 'contact@doncangrejo.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Administrator email for the restaurant',
    example: 'admin@doncangrejo.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiProperty({
    description: 'Business information',
    example: {
      type: 'restaurant',
      cuisineTypes: ['argentina', 'parrilla', 'mariscos'],
      description: 'Traditional Argentine restaurant',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  businessInfo?: {
    type?: string;
    cuisineTypes?: string[];
    description?: string;
  };

  @ApiProperty({
    description: 'Contact information',
    example: {
      phone: '+543329511319',
      address: 'Coronel Apolinario Figueroa 165',
      city: 'CABA',
      country: 'Argentina',
      postalCode: 'C1414',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  contact?: {
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  };

  @ApiProperty({
    description: 'Branding configuration',
    example: {
      colors: {
        primary: '#000000',
        secondary: '#6b7280',
        background: '#ffffff',
        text: '#000000',
      },
      logo: 'https://example.com/logo.png',
      coverImage: 'https://example.com/cover.jpg',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  branding?: any;
}
