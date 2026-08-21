import { Injectable } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { ALL_PLATFORM_IDS } from '@syncpost/platform-core';
import { PrismaService } from '../prisma/prisma.service';

const PLATFORMS: readonly SocialPlatform[] = ALL_PLATFORM_IDS;

@Injectable()
export class PostAnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Platform-wide totals across every user's posts — the per-user Analytics page
  // (apps/user) fetches live engagement metrics from each platform, which doesn't
  // scale to "every post from every user" here; this stays DB-only.
  async getOverview() {
    const posts = await this.prisma.post.findMany({ include: { results: true } });

    const combined = {
      published: posts.filter((p) => p.status === 'PUBLISHED').length,
      failed: posts.filter((p) => p.status === 'FAILED').length,
      partial: posts.filter((p) => p.status === 'PARTIAL').length,
      scheduled: posts.filter((p) => p.status === 'SCHEDULED').length,
      total: posts.length,
    };

    const platformStats = PLATFORMS.map((platform) => {
      const results = posts.flatMap((p) => p.results.filter((r) => r.platform === platform));
      const success = results.filter((r) => r.status === 'SUCCESS').length;
      const failed = results.filter((r) => r.status === 'FAILED').length;
      const pending = results.filter((r) => r.status === 'PENDING').length;
      return { platform, success, failed, pending, attempts: success + failed + pending };
    });

    const topPosters = await this.getTopPosters();

    return { combined, platforms: platformStats, topPosters };
  }

  private async getTopPosters() {
    const grouped = await this.prisma.post.groupBy({
      by: ['userId'],
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return grouped.map((g) => ({
      userId: g.userId,
      name: userById.get(g.userId)?.name ?? 'Unknown',
      email: userById.get(g.userId)?.email ?? '',
      postCount: g._count._all,
    }));
  }
}
