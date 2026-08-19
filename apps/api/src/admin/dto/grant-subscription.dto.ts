import { IsEnum, IsOptional, IsISO8601, IsString } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class GrantSubscriptionDto {
  @IsString()
  planId: string;

  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
