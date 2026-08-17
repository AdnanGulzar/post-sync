import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  // Omitted/null = unlimited.
  @IsOptional()
  @IsInt()
  @Min(0)
  postsLimit?: number | null;

  // Omitted/null = unlimited. This is the "platforms" limit — how many social
  // accounts a user on this plan can connect at once.
  @IsOptional()
  @IsInt()
  @Min(0)
  connectedAccountsLimit?: number | null;

  // The Stripe recurring Price ID (price_...) this plan checks out against.
  // Only needed for a plan with price > 0 — leave unset for a free plan.
  @IsOptional()
  @IsString()
  stripePriceId?: string;
}
