import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { LinkedInIdentityService } from './oauth/linkedin-identity.service';
import { FacebookIdentityService } from './oauth/facebook-identity.service';
import { XIdentityService } from './oauth/x-identity.service';
import { OAuthSignupStateService } from './oauth/oauth-signup-state.service';
import { PlansService } from '../subscriptions/plans.service';
import { StripeService } from '../stripe/stripe.service';

interface OAuthIdentity {
  platformUserId: string;
  email?: string;
  name: string;
  // Present when the sign-in grant also included posting permission (LinkedIn/X always;
  // Facebook only if the person manages a Page) — used to auto-connect the account.
  connect?: {
    platformUserId: string;
    platformUsername?: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    metadata?: Record<string, unknown>;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private stateService: OAuthSignupStateService,
    private linkedInIdentity: LinkedInIdentityService,
    private facebookIdentity: FacebookIdentityService,
    private xIdentity: XIdentityService,
    private plansService: PlansService,
    private stripeService: StripeService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const plan = await this.plansService.findByIdOrThrow(dto.planId);
    if (!plan.isActive) throw new BadRequestException('This plan is no longer available — pick another.');

    const isFree = plan.price === 0;
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'USER',
        // Free plans are usable right away. Paid plans stay INACTIVE until Stripe
        // confirms payment (webhook, or the billing-success page's fallback check).
        subscription: { create: { planId: plan.id, status: isFree ? 'ACTIVE' : 'INACTIVE' } },
      },
    });

    const authResponse = this.buildAuthResponse(user);
    if (isFree) return authResponse;

    if (!plan.stripePriceId) {
      throw new InternalServerErrorException(
        `The "${plan.name}" plan isn't fully set up for payment yet. Contact support.`,
      );
    }

    const customerId = await this.stripeService.createCustomer(user.email, user.name, user.id);
    await this.prisma.subscription.update({ where: { userId: user.id }, data: { stripeCustomerId: customerId } });
    const checkoutUrl = await this.stripeService.createSubscriptionCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      userId: user.id,
      planId: plan.id,
    });

    return { ...authResponse, checkoutUrl };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated');

    return this.buildAuthResponse(user);
  }

  /** Builds the "Continue with LinkedIn/Facebook/X" authorization URL. */
  getOAuthUrl(platform: SocialPlatform): string {
    if (platform === 'X') {
      const codeVerifier = this.xIdentity.generateCodeVerifier();
      const state = this.stateService.create(platform, codeVerifier);
      return this.xIdentity.getAuthUrl(state, codeVerifier);
    }
    const state = this.stateService.create(platform);
    if (platform === 'LINKEDIN') return this.linkedInIdentity.getAuthUrl(state);
    if (platform === 'FACEBOOK') return this.facebookIdentity.getAuthUrl(state);
    throw new BadRequestException(`Unsupported platform: ${platform}`);
  }

  /** Handles the provider's redirect back, then signs the user up or logs them in. */
  async handleOAuthCallback(platform: SocialPlatform, code: string, state: string) {
    const entry = this.stateService.consume(state);
    if (!entry || entry.platform !== platform) {
      throw new BadRequestException('Invalid or expired sign-in attempt. Please try again.');
    }

    let identity: OAuthIdentity;
    if (platform === 'LINKEDIN') identity = await this.linkedInIdentity.fetchIdentity(code);
    else if (platform === 'FACEBOOK') identity = await this.facebookIdentity.fetchIdentity(code);
    else identity = await this.xIdentity.fetchIdentity(code, entry.codeVerifier || '');

    const user = await this.findOrCreateFromOAuth(platform, identity);

    if (identity.connect) {
      const { platformUserId, platformUsername, accessToken, refreshToken, tokenExpiresAt, metadata } = identity.connect;
      await this.prisma.socialAccount.upsert({
        where: { userId_platform: { userId: user.user.id, platform } },
        create: {
          userId: user.user.id,
          platform,
          platformUserId,
          platformUsername,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          metadata: (metadata as any) ?? undefined,
        },
        update: {
          platformUserId,
          platformUsername,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          metadata: (metadata as any) ?? undefined,
        },
      });
    }

    return user;
  }

  private async findOrCreateFromOAuth(platform: SocialPlatform, identity: OAuthIdentity) {
    // X doesn't hand out an email on the standard API tier. Fall back to a
    // deterministic placeholder so repeat sign-ins with the same platform
    // account resolve to the same SyncPost user instead of creating a new one.
    const email = identity.email || `${platform.toLowerCase()}-${identity.platformUserId}@oauth.syncpost.local`;

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
      const planId = await this.plansService.defaultSignupPlanId();
      const plan = await this.plansService.findByIdOrThrow(planId);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: identity.name,
          role: 'USER',
          // OAuth sign-in has no plan-picker step, so it always lands on the default
          // plan — same free-is-instant rule as the form signup applies here too.
          subscription: {
            create: { planId, status: plan.price === 0 ? 'ACTIVE' : 'INACTIVE' },
          },
        },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated');

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: { id: string; email: string; role: string; name: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
