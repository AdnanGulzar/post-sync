import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Post, SocialPlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SocialService, NATIVELY_SCHEDULABLE_PLATFORMS } from '../social/social.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CreatePostDto } from './dto/create-post.dto';

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

  async createAndPublish(userId: string, dto: CreatePostDto) {
    await this.assertWithinPostLimit(userId);

    if (dto.scheduledAt) {
      return this.createScheduled(userId, dto, new Date(dto.scheduledAt));
    }

    const post = await this.prisma.post.create({
      data: {
        userId,
        content: dto.content,
        imageUrl: dto.imageUrl,
        platforms: dto.platforms,
        platformContent: dto.platformContent as any,
        status: 'PUBLISHING',
      },
    });

    await this.publishToPlatforms(post, dto.platforms);
    return this.finalizeStatus(post.id);
  }

  // Facebook can hold and auto-publish scheduled posts itself, so those are handed off
  // to Meta right away. Everything else waits in our DB for the cron sweep below.
  private async createScheduled(userId: string, dto: CreatePostDto, scheduledAt: Date) {
    const post = await this.prisma.post.create({
      data: {
        userId,
        content: dto.content,
        imageUrl: dto.imageUrl,
        platforms: dto.platforms,
        platformContent: dto.platformContent as any,
        status: 'SCHEDULED',
        scheduledAt,
      },
    });

    const nativePlatforms = dto.platforms.filter((p) => NATIVELY_SCHEDULABLE_PLATFORMS.includes(p));

    await Promise.all(
      nativePlatforms.map(async (platform) => {
        try {
          const contentForPlatform = dto.platformContent?.[platform] ?? dto.content;
          const result = await this.socialService.publish(userId, platform, contentForPlatform, dto.imageUrl, scheduledAt);
          await this.prisma.postPublishResult.upsert({
            where: { postId_platform: { postId: post.id, platform } },
            create: { postId: post.id, platform, status: 'PENDING', platformPostId: result.platformPostId },
            update: { status: 'PENDING', platformPostId: result.platformPostId, error: null },
          });
        } catch (err: any) {
          await this.prisma.postPublishResult.upsert({
            where: { postId_platform: { postId: post.id, platform } },
            create: { postId: post.id, platform, status: 'FAILED', error: err.message || 'Unknown error' },
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

    if (post.status === 'SCHEDULED') {
      // Cancel the platform-side schedule for any platform Meta et al. already committed to.
      await Promise.all(
        post.results
          .filter((r) => NATIVELY_SCHEDULABLE_PLATFORMS.includes(r.platform) && r.platformPostId)
          .map((r) =>
            this.socialService.deletePost(userId, r.platform, r.platformPostId as string).catch((err) => {
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
          .filter((r) => r.status === 'SUCCESS' && r.platformPostId)
          .map((r) =>
            this.socialService.deletePost(userId, r.platform, r.platformPostId as string).catch((err) => {
              warnings.push(`Could not delete on ${r.platform}: ${err.message}`);
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
    if (!['SCHEDULED', 'PUBLISHED', 'PARTIAL'].includes(post.status)) {
      throw new BadRequestException('This post cannot be edited right now.');
    }

    // SUCCESS = already live; PENDING = natively scheduled (e.g. Facebook) and already
    // exists on the platform's side even though it hasn't gone out yet — both are editable
    // through the platform's API. Self-managed platforms (LinkedIn/X) that are still just
    // waiting in our own SCHEDULED queue have no result row yet, so updating Post.content
    // below is all that's needed — the cron job will publish the new content when it's due.
    const editOutcomes = await Promise.all(
      post.results
        .filter((r) => (r.status === 'SUCCESS' || r.status === 'PENDING') && r.platformPostId)
        .map(async (r) => {
          try {
            await this.socialService.editPost(userId, r.platform, r.platformPostId as string, content);
            return { platform: r.platform, ok: true as const };
          } catch (err: any) {
            return { platform: r.platform, ok: false as const, message: err.message || 'Unknown error' };
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
    // A per-user override (subscription.postsLimit) wins over the plan's own limit;
    // null/undefined at both levels means unlimited.
    const limit = subscription?.postsLimit ?? subscription?.plan.postsLimit;

    if (limit != null) {
      const usedThisMonth = await this.subscriptionsService.countPostsThisMonth(userId);
      if (usedThisMonth >= limit) {
        throw new BadRequestException(
          `You've reached your plan's limit of ${limit} posts this month. Ask your admin to upgrade your plan.`,
        );
      }
    }
  }

  // Runs every minute. For platforms without native scheduling support, this is what
  // actually publishes a due post; natively-scheduled platforms (Facebook) were already
  // handed off to the provider at creation time, so we just trust their result here.
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
        const platforms = post.platforms as SocialPlatform[];
        const nativePlatforms = platforms.filter((p) => NATIVELY_SCHEDULABLE_PLATFORMS.includes(p));
        const selfManagedPlatforms = platforms.filter((p) => !NATIVELY_SCHEDULABLE_PLATFORMS.includes(p));

        // Only flip PENDING (successfully handed off at creation time) to SUCCESS here —
        // a native platform that already failed to schedule stays FAILED.
        const pendingNativePlatforms = nativePlatforms.filter(
          (platform) => post.results.find((r) => r.platform === platform)?.status === 'PENDING',
        );
        await Promise.all(
          pendingNativePlatforms.map((platform) =>
            this.prisma.postPublishResult.update({
              where: { postId_platform: { postId: post.id, platform } },
              data: { status: 'SUCCESS', publishedAt: new Date() },
            }),
          ),
        );

        await this.publishToPlatforms({ ...post, status: 'PUBLISHING' }, selfManagedPlatforms);
        await this.finalizeStatus(post.id);
      } catch (err) {
        this.logger.error(`Failed to publish scheduled post ${post.id}`, err as Error);
      }
    }
  }

  // Publishes to the given platforms and upserts their PostPublishResult rows.
  // Does NOT touch Post.status — call finalizeStatus afterwards for that.
  private async publishToPlatforms(post: Post, platformsToPublish: SocialPlatform[]) {
    const platformContent = (post.platformContent as Partial<Record<SocialPlatform, string>> | null) ?? {};
    const outcomes = await Promise.allSettled(
      platformsToPublish.map((platform) =>
        this.socialService.publish(
          post.userId,
          platform,
          platformContent[platform] ?? post.content,
          post.imageUrl ?? undefined,
        ),
      ),
    );

    await Promise.all(
      outcomes.map((outcome, i) => {
        const platform = platformsToPublish[i];
        if (outcome.status === 'fulfilled') {
          return this.prisma.postPublishResult.upsert({
            where: { postId_platform: { postId: post.id, platform } },
            create: {
              postId: post.id,
              platform,
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
          where: { postId_platform: { postId: post.id, platform } },
          create: {
            postId: post.id,
            platform,
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
