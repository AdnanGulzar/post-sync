import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Post, SocialAccount, SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService, isNativelySchedulable } from '../social/social.service';
import { PostMetrics } from '../social/publisher.interface';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PublishDraftDto } from './dto/publish-draft.dto';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private prisma: PrismaService,
    private socialService: SocialService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async listMine(userId: string) {
    return this.prisma.post.findMany({
      where: { userId },
      include: { results: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Live per-destination metrics, fetched straight from each platform's API. A
  // token/API hiccup on one result just leaves its metrics unset instead of
  // failing the whole post — the platform post may have since been deleted there,
  // a token may have expired, etc.
  private async attachMetrics<T extends { id: string; status: string; platformPostId: string | null; socialAccountId: string | null }>(
    userId: string,
    results: T[],
  ): Promise<(T & { metrics: PostMetrics | null })[]> {
    return Promise.all(
      results.map(async (r) => {
        if (r.status !== 'SUCCESS' || !r.platformPostId || !r.socialAccountId) {
          return { ...r, metrics: null };
        }
        try {
          const metrics = await this.socialService.getMetrics(userId, r.socialAccountId, r.platformPostId);
          return { ...r, metrics };
        } catch {
          return { ...r, metrics: null };
        }
      }),
    );
  }

  async findOne(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { results: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    const results = await this.attachMetrics(userId, post.results);
    return { ...post, results };
  }

  // Combined totals across all posts, plus a breakdown per platform (publishing
  // outcomes + real engagement summed from live platform metrics) for the
  // Analytics page.
  async getAnalytics(userId: string, from?: string, to?: string) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);

    const posts = await this.prisma.post.findMany({
      where: { userId, ...(from || to ? { createdAt } : {}) },
      include: { results: true },
      orderBy: { createdAt: 'desc' },
    });

    const combined = {
      published: posts.filter((p) => p.status === 'PUBLISHED').length,
      failed: posts.filter((p) => p.status === 'FAILED').length,
      partial: posts.filter((p) => p.status === 'PARTIAL').length,
      scheduled: posts.filter((p) => p.status === 'SCHEDULED').length,
      total: posts.length,
    };

    const allResults = posts.flatMap((post) => post.results.map((result) => ({ post, result })));
    const withMetrics = await this.attachMetrics(
      userId,
      allResults.map(({ result }) => result),
    );
    const metricsByResultId = new Map(withMetrics.map((r) => [r.id, r.metrics]));

    const platforms: SocialPlatform[] = ['LINKEDIN', 'FACEBOOK', 'X'];
    const platformStats = platforms.map((platform) => {
      const entries = allResults.filter(({ result }) => result.platform === platform);
      const success = entries.filter(({ result }) => result.status === 'SUCCESS').length;
      const failed = entries.filter(({ result }) => result.status === 'FAILED').length;
      const pending = entries.filter(({ result }) => result.status === 'PENDING').length;

      const totals = { likes: 0, comments: 0, shares: 0, impressions: 0 };
      for (const { result } of entries) {
        const m = metricsByResultId.get(result.id);
        if (!m) continue;
        totals.likes += m.likes ?? 0;
        totals.comments += m.comments ?? 0;
        totals.shares += m.shares ?? 0;
        totals.impressions += m.impressions ?? 0;
      }

      const recentPosts = entries
        .filter(({ result }) => result.status === 'SUCCESS')
        .map(({ post, result }) => ({
          postId: post.id,
          content: post.content,
          destinationLabel: result.destinationLabel,
          publishedAt: result.publishedAt,
          metrics: metricsByResultId.get(result.id) ?? null,
        }))
        .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime());

      return { platform, success, failed, pending, attempts: success + failed + pending, totals, recentPosts };
    });

    return { combined, platforms: platformStats };
  }

  // Loads and validates the destinations a post targets — every id must be a
  // connected account owned by this user.
  private async loadDestinations(userId: string, destinationIds: string[]): Promise<SocialAccount[]> {
    const accounts = await this.prisma.socialAccount.findMany({ where: { id: { in: destinationIds }, userId } });
    if (accounts.length !== destinationIds.length) {
      throw new BadRequestException('One or more selected destinations are no longer connected.');
    }
    return accounts;
  }

  private labelFor(account: SocialAccount): string {
    const kind = account.destinationType === 'PAGE' ? 'Page' : account.destinationType === 'GROUP' ? 'Group' : 'Personal';
    return account.platformUsername ? `${account.platformUsername} (${kind})` : `${account.platform} ${kind}`;
  }

  async createAndPublish(userId: string, dto: CreatePostDto) {
    if (dto.saveAsDraft) {
      return this.saveDraft(userId, dto);
    }

    if (!dto.destinationIds || dto.destinationIds.length === 0) {
      throw new BadRequestException('Pick at least one destination to publish to.');
    }
    await this.assertWithinPostLimit(userId);
    const destinations = await this.loadDestinations(userId, dto.destinationIds);
    const platforms = [...new Set(destinations.map((d) => d.platform))];
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;

    const post = await this.prisma.post.create({
      data: {
        userId,
        content: dto.content,
        imageUrl: dto.imageUrl,
        destinationIds: dto.destinationIds,
        platforms,
        platformContent: dto.platformContent as any,
        status: scheduledAt ? 'SCHEDULED' : 'PUBLISHING',
        scheduledAt,
      },
    });

    return this.publishOrSchedule(post, destinations, scheduledAt);
  }

  // A draft has no destinations or publish attempt yet — just the content saved for
  // later. destinationIds may still be pre-filled with whatever was selected in the
  // composer, purely so resuming the draft starts with the same selection checked.
  private async saveDraft(userId: string, dto: CreatePostDto) {
    const destinationIds = dto.destinationIds ?? [];
    const destinations = destinationIds.length > 0 ? await this.loadDestinations(userId, destinationIds) : [];
    const platforms = [...new Set(destinations.map((d) => d.platform))];

    return this.prisma.post.create({
      data: {
        userId,
        content: dto.content,
        imageUrl: dto.imageUrl,
        destinationIds,
        platforms,
        platformContent: dto.platformContent as any,
        status: 'DRAFT',
      },
      include: { results: true },
    });
  }

  // Turns an existing draft into a real post — publishing it now or scheduling it.
  // Any of content/imageUrl/platformContent can be overridden at this point too, in
  // case the draft was tweaked right before publishing.
  async publishDraft(userId: string, postId: string, dto: PublishDraftDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    if (post.status !== 'DRAFT') throw new BadRequestException('Only a draft can be published this way.');

    await this.assertWithinPostLimit(userId);
    const destinations = await this.loadDestinations(userId, dto.destinationIds);
    const platforms = [...new Set(destinations.map((d) => d.platform))];
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        content: dto.content ?? post.content,
        imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : post.imageUrl,
        destinationIds: dto.destinationIds,
        platforms,
        platformContent: (dto.platformContent ?? post.platformContent) as any,
        status: scheduledAt ? 'SCHEDULED' : 'PUBLISHING',
        scheduledAt,
      },
    });

    return this.publishOrSchedule(updated, destinations, scheduledAt);
  }

  // Shared tail end of "create/turn a post into a real publish attempt", used by both
  // a fresh post and a draft being published. Destinations that natively schedule
  // (Facebook Pages) are handed off to the provider right away when scheduledAt is
  // set; everything else either publishes immediately or waits for the cron sweep.
  private async publishOrSchedule(post: Post, destinations: SocialAccount[], scheduledAt?: Date) {
    if (!scheduledAt) {
      await this.publishToDestinations(post, destinations);
      return this.finalizeStatus(post.id);
    }

    const nativeDestinations = destinations.filter((d) => isNativelySchedulable(d.platform, d.destinationType));
    const platformContent = (post.platformContent as Partial<Record<SocialPlatform, string>> | null) ?? {};

    await Promise.all(
      nativeDestinations.map(async (account) => {
        try {
          const contentForPlatform = platformContent[account.platform] ?? post.content;
          const result = await this.socialService.publish(
            post.userId,
            account.id,
            contentForPlatform,
            post.imageUrl ?? undefined,
            scheduledAt,
          );
          await this.prisma.postPublishResult.upsert({
            where: { postId_socialAccountId: { postId: post.id, socialAccountId: account.id } },
            create: {
              postId: post.id,
              socialAccountId: account.id,
              platform: account.platform,
              destinationLabel: this.labelFor(account),
              status: 'PENDING',
              platformPostId: result.platformPostId,
            },
            update: { status: 'PENDING', platformPostId: result.platformPostId, error: null },
          });
        } catch (err: any) {
          await this.prisma.postPublishResult.upsert({
            where: { postId_socialAccountId: { postId: post.id, socialAccountId: account.id } },
            create: {
              postId: post.id,
              socialAccountId: account.id,
              platform: account.platform,
              destinationLabel: this.labelFor(account),
              status: 'FAILED',
              error: err.message || 'Unknown error',
            },
            update: { status: 'FAILED', error: err.message || 'Unknown error' },
          });
        }
      }),
    );

    return this.prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: { results: true } });
  }

  async remove(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { results: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    if (post.status === 'DRAFT') {
      // Never touched a platform — just remove it.
      await this.prisma.post.delete({ where: { id: postId } });
      return { id: postId };
    }

    if (post.status === 'SCHEDULED') {
      // PENDING results are natively-scheduled destinations Meta et al. already
      // committed to — cancel those there too. Self-managed destinations never got
      // a result row yet, so there's nothing to cancel on the platform side.
      await Promise.all(
        post.results
          .filter((r) => r.status === 'PENDING' && r.platformPostId && r.socialAccountId)
          .map((r) =>
            this.socialService.deletePost(userId, r.socialAccountId as string, r.platformPostId as string).catch((err) => {
              this.logger.warn(`Failed to cancel native schedule for post ${postId} on ${r.platform}: ${err.message}`);
            }),
          ),
      );
      await this.prisma.post.delete({ where: { id: postId } });
      return { id: postId };
    }

    if (['PUBLISHED', 'PARTIAL', 'FAILED'].includes(post.status)) {
      const warnings: string[] = [];
      await Promise.all(
        post.results
          .filter((r) => r.status === 'SUCCESS' && r.platformPostId && r.socialAccountId)
          .map((r) =>
            this.socialService.deletePost(userId, r.socialAccountId as string, r.platformPostId as string).catch((err) => {
              warnings.push(`Could not delete on ${r.destinationLabel || r.platform}: ${err.message}`);
            }),
          ),
      );
      await this.prisma.post.delete({ where: { id: postId } });
      return { id: postId, warnings };
    }

    throw new BadRequestException(`Post is currently ${post.status.toLowerCase()} and can't be deleted right now.`);
  }

  async updateContent(userId: string, postId: string, content: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { results: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();
    if (!['DRAFT', 'SCHEDULED', 'PUBLISHED', 'PARTIAL'].includes(post.status)) {
      throw new BadRequestException('This post cannot be edited right now.');
    }

    // SUCCESS = already live; PENDING = natively scheduled (e.g. a Facebook Page) and
    // already exists on the platform's side even though it hasn't gone out yet — both
    // are editable through the platform's API. Self-managed destinations still just
    // waiting in our own SCHEDULED queue have no result row yet, so updating
    // Post.content below is all that's needed — the cron job publishes the new
    // content when it's due.
    const editOutcomes = await Promise.all(
      post.results
        .filter((r) => (r.status === 'SUCCESS' || r.status === 'PENDING') && r.platformPostId && r.socialAccountId)
        .map(async (r) => {
          try {
            await this.socialService.editPost(userId, r.socialAccountId as string, r.platformPostId as string, content);
            return { platform: r.platform, destinationLabel: r.destinationLabel, ok: true as const };
          } catch (err: any) {
            return {
              platform: r.platform,
              destinationLabel: r.destinationLabel,
              ok: false as const,
              message: err.message || 'Unknown error',
            };
          }
        }),
    );

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { content },
      include: { results: true },
    });

    return { post: updated, editOutcomes };
  }

  private async assertWithinPostLimit(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
    // null means the plan is unlimited.
    const limit = subscription?.plan.postsLimit;

    if (limit != null) {
      const usedThisMonth = await this.subscriptionsService.countPostsThisMonth(userId);
      if (usedThisMonth >= limit) {
        throw new BadRequestException(
          `You've reached your plan's limit of ${limit} posts this month. Ask your admin to upgrade your plan.`,
        );
      }
    }
  }

  // Runs every minute. For destinations without native scheduling support, this is
  // what actually publishes a due post; natively-scheduled destinations (Facebook
  // Pages) were already handed off to the provider at creation time, so we just
  // trust their result here (unless that attempt itself already failed).
  @Cron(CronExpression.EVERY_MINUTE)
  async processDueScheduledPosts() {
    const duePosts = await this.prisma.post.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      include: { results: true },
    });

    for (const post of duePosts) {
      const claimed = await this.prisma.post.updateMany({
        where: { id: post.id, status: 'SCHEDULED' },
        data: { status: 'PUBLISHING' },
      });
      if (claimed.count === 0) continue; // already picked up elsewhere

      try {
        const resultByDestination = new Map(post.results.filter((r) => r.socialAccountId).map((r) => [r.socialAccountId as string, r]));

        // A result already exists for anything handed off natively at creation time
        // (PENDING = succeeded, just flip to SUCCESS; FAILED = don't retry). Anything
        // with no result yet is self-managed and needs publishing right now.
        const pendingNativeIds = post.destinationIds.filter((id) => resultByDestination.get(id)?.status === 'PENDING');
        const selfManagedIds = post.destinationIds.filter((id) => !resultByDestination.has(id));

        await Promise.all(
          pendingNativeIds.map((socialAccountId) =>
            this.prisma.postPublishResult.update({
              where: { postId_socialAccountId: { postId: post.id, socialAccountId } },
              data: { status: 'SUCCESS', publishedAt: new Date() },
            }),
          ),
        );

        if (selfManagedIds.length > 0) {
          const accounts = await this.prisma.socialAccount.findMany({ where: { id: { in: selfManagedIds } } });
          await this.publishToDestinations({ ...post, status: 'PUBLISHING' }, accounts);
        }

        await this.finalizeStatus(post.id);
      } catch (err) {
        this.logger.error(`Failed to publish scheduled post ${post.id}`, err as Error);
      }
    }
  }

  // Publishes to the given destinations and upserts their PostPublishResult rows.
  // Does NOT touch Post.status — call finalizeStatus afterwards for that.
  private async publishToDestinations(post: Post, destinations: SocialAccount[]) {
    if (destinations.length === 0) return;
    const platformContent = (post.platformContent as Partial<Record<SocialPlatform, string>> | null) ?? {};

    const outcomes = await Promise.allSettled(
      destinations.map((account) =>
        this.socialService.publish(
          post.userId,
          account.id,
          platformContent[account.platform] ?? post.content,
          post.imageUrl ?? undefined,
        ),
      ),
    );

    await Promise.all(
      outcomes.map((outcome, i) => {
        // Promise.allSettled preserves input order, so this index is always
        // populated; the guard exists to satisfy noUncheckedIndexedAccess
        // rather than to handle a reachable case.
        const account = destinations[i];
        if (!account) return Promise.resolve(null);
        if (outcome.status === 'fulfilled') {
          return this.prisma.postPublishResult.upsert({
            where: { postId_socialAccountId: { postId: post.id, socialAccountId: account.id } },
            create: {
              postId: post.id,
              socialAccountId: account.id,
              platform: account.platform,
              destinationLabel: this.labelFor(account),
              status: 'SUCCESS',
              platformPostId: outcome.value.platformPostId,
              publishedAt: new Date(),
            },
            update: {
              status: 'SUCCESS',
              platformPostId: outcome.value.platformPostId,
              publishedAt: new Date(),
              error: null,
            },
          });
        }
        return this.prisma.postPublishResult.upsert({
          where: { postId_socialAccountId: { postId: post.id, socialAccountId: account.id } },
          create: {
            postId: post.id,
            socialAccountId: account.id,
            platform: account.platform,
            destinationLabel: this.labelFor(account),
            status: 'FAILED',
            error: outcome.reason?.message || 'Unknown error',
          },
          update: {
            status: 'FAILED',
            error: outcome.reason?.message || 'Unknown error',
          },
        });
      }),
    );
  }

  // Derives Post.status from the complete, current set of PostPublishResult rows —
  // safer than tracking outcomes through partial (native vs self-managed) publish calls.
  private async finalizeStatus(postId: string) {
    const results = await this.prisma.postPublishResult.findMany({ where: { postId } });
    const allSucceeded = results.length > 0 && results.every((r) => r.status === 'SUCCESS');
    const allFailed = results.length === 0 || results.every((r) => r.status === 'FAILED');
    const finalStatus = allSucceeded ? 'PUBLISHED' : allFailed ? 'FAILED' : 'PARTIAL';

    return this.prisma.post.update({
      where: { id: postId },
      data: { status: finalStatus },
      include: { results: true },
    });
  }
}
