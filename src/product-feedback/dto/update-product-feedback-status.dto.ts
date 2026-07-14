import { IsEnum } from 'class-validator';
import { ProductFeedbackStatus } from '@prisma/client';

export class UpdateProductFeedbackStatusDto {
  @IsEnum(ProductFeedbackStatus)
  status: ProductFeedbackStatus;
}
