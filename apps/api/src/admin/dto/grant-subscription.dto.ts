import { IsEnum, IsInt, IsOptional, IsISO8601, IsString, Min } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class GrantSubscriptionDto {
  @IsString()
  planId: string;

  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;

  // Per-user override of the plan's own postsLimit; omitted/null = use the plan's limit.
  @IsOptional()
  @IsInt()
  @Min(0)
  postsLimit?: number | null;

  // Per-user override of the plan's own connectedAccountsLimit ("platforms");
  // omitted/null = use the plan's limit.
  @IsOptional()
  @IsInt()
  @Min(0)
  connectedAccountsLimit?: number | null;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
