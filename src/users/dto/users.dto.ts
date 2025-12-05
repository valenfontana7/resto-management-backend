import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  IsArray,
  MinLength,
  Matches,
  IsHexColor,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ============================================
// USER DTOs
// ============================================

export class CreateUserDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ example: 'clx123abc456def' })
  @IsString()
  roleId: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ example: 'NewPassword123!' })
  @IsString()
  @MinLength(6)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  @IsOptional()
  password?: string;
}

export class UserFiltersDto {
  @ApiPropertyOptional({ example: 'clx123abc456def' })
  @IsString()
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'john' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

// ============================================
// ROLE DTOs
// ============================================

export class CreateRoleDto {
  @ApiProperty({ example: 'Cashier' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: ['manage_payments', 'view_orders'],
    description: 'Array of permission strings',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({ example: '#10b981', default: '#6366f1' })
  @IsHexColor()
  @IsOptional()
  color?: string = '#6366f1';
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class RoleFiltersDto {
  @ApiPropertyOptional({ example: 'Manager' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  includeSystemRoles?: boolean = false;
}
