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
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
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
  ],
  exports: [JwtModule],
})
export class AuthModule {}
