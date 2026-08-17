import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  // The plan picked on the signup form. Free plans activate immediately; paid
  // plans get a Stripe Checkout session instead of instant access.
  @IsString()
  @MinLength(1)
  planId: string;
}
