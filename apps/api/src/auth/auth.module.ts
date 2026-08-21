import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OAuthSignupStateService } from './oauth/oauth-signup-state.service';
import { LinkedInIdentityService } from './oauth/linkedin-identity.service';
import { FacebookIdentityService } from './oauth/facebook-identity.service';
import { XIdentityService } from './oauth/x-identity.service';
import { GoogleIdentityService } from './oauth/google-identity.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StripeModule } from '../stripe/stripe.module';
import { requireEnv } from '../config/require-env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: requireEnv('JWT_SECRET'),
      signOptions: { expiresIn: '7d' },
    }),
    SubscriptionsModule,
    StripeModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    OAuthSignupStateService,
    LinkedInIdentityService,
    FacebookIdentityService,
    XIdentityService,
    GoogleIdentityService,
  ],
  exports: [JwtModule],
})
export class AuthModule {}
