import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthStateService } from './oauth-state.service';
import { LinkedInService } from './linkedin.service';
import { FacebookService } from './facebook.service';
import { TwitterService } from './twitter.service';
import { SocialPlatformService, PublishResult } from './publisher.interface';

// Platforms whose public API can hold and auto-publish a post at a future time itself.
// Everything else has to be scheduled from our side (held locally, published by our cron job).
export const NATIVELY_SCHEDULABLE_PLATFORMS: SocialPlatform[] = ['FACEBOOK'];

@Injectable()
export class SocialService {
  private services: Record<SocialPlatform, SocialPlatformService>;

  constructor(
    private prisma: PrismaService,
    private stateService: OAuthStateService,
    private linkedIn: LinkedInService,
    private facebook: FacebookService,
    private twitter: TwitterService,
  ) {
    this.services = {
      LINKEDIN: this.linkedIn,
      FACEBOOK: this.facebook,
      X: this.twitter,
    };
  }

  private serviceFor(platform: SocialPlatform): SocialPlatformService {
    const service = this.services[platform];
    if (!service) throw new BadRequestException(`Unsupported platform: ${platform}`);
    return service;
  }

  listAccounts(userId: string) {
    return this.prisma.socialAccount.findMany({
      where: { userId },
      select: { id: true, platform: true, platformUsername: true, connectedAt: true },
    });
  }

  getConnectUrl(userId: string, platform: SocialPlatform): string {
    const service = this.serviceFor(platform);
    let codeVerifier: string | undefined;
    if (platform === 'X') {
      codeVerifier = TwitterService.generateCodeVerifier();
    }
    const state = this.stateService.create(userId, platform, codeVerifier);
    return service.getAuthUrl(state, codeVerifier);
  }

  async handleCallback(platform: SocialPlatform, code: string, state: string) {
    const entry = this.stateService.consume(state);
    if (!entry || entry.platform !== platform) {
      throw new BadRequestException('Invalid or expired OAuth state. Please try connecting again.');
    }

    const existing = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId: entry.userId, platform } },
    });
    // Only a brand-new connection counts against the limit — reconnecting/refreshing
    // an already-connected platform should always be allowed.
    if (!existing) {
      await this.assertWithinConnectedAccountsLimit(entry.userId);
    }

    const service = this.serviceFor(platform);
    const result = await service.handleCallback(code, entry.codeVerifier);

    return this.prisma.socialAccount.upsert({
      where: { userId_platform: { userId: entry.userId, platform } },
      create: {
        userId: entry.userId,
        platform,
        platformUserId: result.platformUserId,
        platformUsername: result.platformUsername,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
        metadata: (result.metadata as any) ?? undefined,
      },
      update: {
        platformUserId: result.platformUserId,
        platformUsername: result.platformUsername,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt: result.tokenExpiresAt,
        metadata: (result.metadata as any) ?? undefined,
      },
    });
  }

  private async assertWithinConnectedAccountsLimit(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    // A per-user override wins over the plan's own limit; null/undefined at both levels
    // means unlimited platforms can be connected.
    const limit = subscription?.connectedAccountsLimit ?? subscription?.plan.connectedAccountsLimit;

    if (limit != null) {
      const connectedCount = await this.prisma.socialAccount.count({ where: { userId } });
      if (connectedCount >= limit) {
        throw new BadRequestException(
          `You've reached your plan's limit of ${limit} connected platform${limit === 1 ? '' : 's'}. Disconnect one first, or ask your admin to upgrade your plan.`,
        );
      }
    }
  }

  async disconnect(userId: string, platform: SocialPlatform) {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) throw new NotFoundException('No connected account for this platform');
    return this.prisma.socialAccount.delete({ where: { id: account.id } });
  }

  async publish(
    userId: string,
    platform: SocialPlatform,
    content: string,
    imageUrl?: string,
    scheduledAt?: Date,
  ): Promise<PublishResult> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) {
      throw new BadRequestException(`${platform} is not connected for this user`);
    }
    const service = this.serviceFor(platform);
    return service.publish(account, content, imageUrl, scheduledAt);
  }

  async deletePost(userId: string, platform: SocialPlatform, platformPostId: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) {
      throw new BadRequestException(`${platform} is not connected for this user`);
    }
    const service = this.serviceFor(platform);
    return service.deletePost(account, platformPostId);
  }

  async editPost(userId: string, platform: SocialPlatform, platformPostId: string, content: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!account) {
      throw new BadRequestException(`${platform} is not connected for this user`);
    }
    const service = this.serviceFor(platform);
    return service.editPost(account, platformPostId, content);
  }
}
