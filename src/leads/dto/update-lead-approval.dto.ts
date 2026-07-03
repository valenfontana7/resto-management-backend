import { IsObject } from 'class-validator';

export class UpdateLeadApprovalDto {
  @IsObject()
  content!: Record<string, unknown>;
}
