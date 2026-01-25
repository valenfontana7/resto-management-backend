import { IsString } from 'class-validator';

export class ImpersonateDto {
  @IsString()
  restaurantId: string;
}
