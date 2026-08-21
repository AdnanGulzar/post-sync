import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinationType, SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OAuthStateService } from './oauth-state.service';
import { PublisherRegistry } from './publishers/publisher.registry';
import { createCodeVerifier } from './publishers/pkce';
import { PLATFORMS } from '@syncpost/platform-core';
import { SocialPlatformService, PublishResult, PostMetrics } from './publisher.interface';

@Injectable()
export class SocialService {
  constructor(
    private prisma: PrismaService,
    private stateService: OAuthStateService,
    private registry: PublisherRegistry,
  ) {}

  /**
   * Resolves the publisher for a platform.
   *
   * @param platform - Platform to publish to.
   * @returns The registered publisher.
   * @throws {BadRequestException} If no publisher is registered — unreachable
   *         in a booted app, since the registry validates completeness at
   *         startup rather than at publish time.
   */
  private serviceFor(platform: SocialPlatform): SocialPlatformService {
    return this.registry.for(platform);
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
    // Driven by the descriptor so a second PKCE platform needs no new branch.
    const codeVerifier =
      PLATFORMS[platform].connection === 'oauth2-pkce' ? createCodeVerifier() : undefined;
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
