import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from '../posts/posts.service';

/**
 * Posts claimed per tick. Bounds memory and keeps one large backlog from
 * monopolising a tick; the previous implementation loaded every due post at once.
 */
const CLAIM_BATCH_SIZE = 25;

/**
 * How long a post may sit in PUBLISHING before it is considered abandoned.
 *
 * Generous on purpose: it must exceed the slowest realistic fan-out, or the
 * reaper would reclaim work that is still in flight and publish it twice.
 */
const STALE_PUBLISHING_MINUTES = 15;

/** Failed destinations re-attempted per tick. */
const RETRY_BATCH_SIZE = 50;

/**
 * Owns scheduled publishing and retries.
 *
 * Split out of PostsService, which is a controller-facing business service that
 * also happened to carry the @Cron. Keeping them together meant every API pod
 * was also a worker pod with no way to separate them; WORKER_ENABLED now gates
 * that.
 */
@Injectable()
export class PublishingWorker {
  private readonly logger = new Logger(PublishingWorker.name);

  /**
   * Set WORKER_ENABLED=false on pods that should serve HTTP only. Defaults to
   * enabled so a single-process deployment keeps working untouched.
   */
  private readonly enabled = process.env.WORKER_ENABLED !== 'false';

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  /**
   * One scheduling tick.
   *
   * Reaping runs first so a post abandoned by a previous tick is eligible again
   * in this one, rather than waiting a further minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.reapStalePublishing();
      await this.publishDuePosts();
      await this.retryFailedDestinations();
    } catch (err: unknown) {
      // A tick must never throw: an unhandled rejection here would take the
      // scheduler down and stop all future ticks silently.
      this.logger.error('Publishing tick failed', err as Error);
    }
  }

  /**
   * Returns posts abandoned mid-publish to the scheduled queue.
   *
   * This is the fix for posts wedging forever. Claiming set a post to
   * PUBLISHING, but the sweep only ever queried SCHEDULED — so if the process
   * died between the claim and finalisation, no code path would look at that
   * post again. There was no reaper anywhere.
   *
   * Re-publishing is safe because {@link PostsService.publishToDestinations}
   * skips destinations that already hold a SUCCESS result, so a recovered post
   * completes the remaining destinations rather than double-posting.
   */
  private async reapStalePublishing(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_PUBLISHING_MINUTES * 60_000);

    const { count } = await this.prisma.post.updateMany({
      where: { status: 'PUBLISHING', updatedAt: { lt: cutoff } },
      data: { status: 'SCHEDULED' },
    });

    if (count > 0) {
      this.logger.warn(
        `Recovered ${count} post(s) stuck in PUBLISHING for over ${STALE_PUBLISHING_MINUTES} minutes`,
      );
    }
  }

  /**
   * Claims and publishes posts whose scheduled time has arrived.
   *
   * The claim is a single statement using FOR UPDATE SKIP LOCKED, so several
   * instances can run this concurrently: each takes a disjoint batch instead of
   * contending over the same rows.
   */
  private async publishDuePosts(): Promise<void> {
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE posts SET status = 'PUBLISHING', "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM posts
        WHERE status = 'SCHEDULED' AND "scheduledAt" <= NOW()
        ORDER BY "scheduledAt"
        LIMIT ${CLAIM_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;

    for (const { id } of claimed) {
      try {
        await this.posts.publishClaimedPost(id);
      } catch (err: unknown) {
        // Left in PUBLISHING deliberately: the reaper will pick it up rather
        // than this tick spinning on a post that is failing hard.
        this.logger.error(`Failed to publish scheduled post ${id}`, err as Error);
      }
    }

    if (claimed.length === CLAIM_BATCH_SIZE) {
      this.logger.log(`Claimed a full batch of ${CLAIM_BATCH_SIZE}; more posts remain due`);
    }
  }

  /**
   * Re-attempts destinations whose backoff has elapsed.
   *
   * Retries are per destination, not per post: one rate-limited platform should
   * not re-publish to the platforms that already succeeded.
   */
  private async retryFailedDestinations(): Promise<void> {
    const due = await this.prisma.postPublishResult.findMany({
      where: { status: 'RETRYING', nextRetryAt: { lte: new Date() } },
      select: { postId: true },
      distinct: ['postId'],
      take: RETRY_BATCH_SIZE,
    });

    for (const { postId } of due) {
      try {
        await this.posts.retryFailedDestinations(postId);
      } catch (err: unknown) {
        this.logger.error(`Retry sweep failed for post ${postId}`, err as Error);
      }
    }
  }
}
