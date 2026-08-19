import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  // Plan choice now happens on the /billing page right after account creation,
  // not in the signup form itself — omitted here means "start on the default
  // (Free) plan". Still accepted for callers that do want to pick it upfront:
  // free plans activate immediately, paid plans get a Stripe Checkout session.
  @IsOptional()
  @IsString()
  @MinLength(1)
  planId?: string;
}
