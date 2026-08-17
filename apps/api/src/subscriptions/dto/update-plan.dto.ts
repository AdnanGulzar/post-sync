import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

// A full-state PATCH: send every field with its intended value each time
// (matches how the admin UI form works) — a number sets a limit, null means
// unlimited, and there's no partial/sparse-update support here.
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  postsLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  connectedAccountsLimit?: number | null;

  // The "disable this plan" switch — disabled plans can't be newly assigned,
  // but users already on it keep working.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // The Stripe recurring Price ID (price_...) this plan checks out against.
  @IsOptional()
  @IsString()
  stripePriceId?: string;
}
