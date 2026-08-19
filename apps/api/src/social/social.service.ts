import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinationType, SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthStateService } from './oauth-state.service';
import { LinkedInService } from './linkedin.service';
import { FacebookService } from './facebook.service';
import { TwitterService } from './twitter.service';
import { SocialPlatformService, PublishResult, PostMetrics } from './publisher.interface';

/** Facebook Pages can be natively scheduled by Meta; nothing else can. */
export function isNativelySchedulable(platform: SocialPlatform, destinationType: DestinationType): boolean {
  return platform === 'FACEBOOK' && destinationType === 'PAGE';
}

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
      select: { id: true, platform: true, destinationType: true, platformUsername: true, connectedAt: true },
      orderBy: { connectedAt: 'asc' },
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

    await this.assertPlatformAllowed(entry.userId, platform);

    const service = this.serviceFor(platform);
    const destinations = await service.handleCallback(code, entry.codeVerifier);

    const existing = await this.prisma.socialAccount.findMany({
      where: { userId: entry.userId, platform },
      select: { platformUserId: true },
    });
    const existingIds = new Set(existing.map((e) => e.platformUserId));
    const newCount = destinations.filter((d) => !existingIds.has(d.platformUserId)).length;
    await this.assertWithinConnectedAccountsLimit(entry.userId, newCount);

    const accounts = await Promise.all(
      destinations.map((result) =>
        this.prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: {
              userId: entry.userId,
              platform,
              platformUserId: result.platformUserId,
            },
          },
          create: {
            userId: entry.userId,
            platform,
            destinationType: result.destinationType,
            platformUserId: result.platformUserId,
            platformUsername: result.platformUsername,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            tokenExpiresAt: result.tokenExpiresAt,
            metadata: (result.metadata as any) ?? undefined,
          },
          update: {
            destinationType: result.destinationType,
            platformUsername: result.platformUsername,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            tokenExpiresAt: result.tokenExpiresAt,
            metadata: (result.metadata as any) ?? undefined,
          },
        }),
      ),
    );

    return accounts;
  }

  private async assertPlatformAllowed(userId: string, platform: SocialPlatform) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    if (subscription && !subscription.plan.platforms.includes(platform)) {
      throw new BadRequestException(
        `Your plan doesn't include ${platform}. Ask your admin to upgrade your plan to connect it.`,
      );
    }
  }

  private async assertWithinConnectedAccountsLimit(userId: string, additionalCount: number) {
    if (additionalCount <= 0) return;
    const subscription = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    const limit = subscription?.plan.connectedAccountsLimit;

    if (limit != null) {
      const connectedCount = await this.prisma.socialAccount.count({ where: { userId } });
      if (connectedCount + additionalCount > limit) {
        throw new BadRequestException(
          `Connecting this would put you over your plan's limit of ${limit} connected platform${limit === 1 ? '' : 's'} (you have ${connectedCount}, this would add ${additionalCount}). Disconnect one first, or ask your admin to upgrade your plan.`,
        );
      }
    }
  }

  private async accountFor(userId: string, id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.userId !== userId) throw new NotFoundException('Connected account not found');
    return account;
  }

  async disconnect(userId: string, id: string) {
    const account = await this.accountFor(userId, id);
    return this.prisma.socialAccount.delete({ where: { id: account.id } });
  }

  async publish(userId: string, destinationId: string, content: string, imageUrl?: string, scheduledAt?: Date): Promise<PublishResult> {
    const account = await this.accountFor(userId, destinationId);
    const service = this.serviceFor(account.platform);
    return service.publish(account, content, imageUrl, scheduledAt);
  }

  async deletePost(userId: string, destinationId: string, platformPostId: string): Promise<void> {
    const account = await this.accountFor(userId, destinationId);
    const service = this.serviceFor(account.platform);
    return service.deletePost(account, platformPostId);
  }

  async editPost(userId: string, destinationId: string, platformPostId: string, content: string): Promise<void> {
    const account = await this.accountFor(userId, destinationId);
    const service = this.serviceFor(account.platform);
    return service.editPost(account, platformPostId, content);
  }

  async getMetrics(userId: string, destinationId: string, platformPostId: string): Promise<PostMetrics> {
    const account = await this.accountFor(userId, destinationId);
    const service = this.serviceFor(account.platform);
    return service.getMetrics(account, platformPostId);
  }
}
