import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private plansService: PlansService,
  ) {}

  async getMySubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });
    const plans = await this.plansService.listActive();
    return { subscription, plans };
  }

  /**
   * Counts posts created in the current calendar month, used to enforce plan limits.
   * Drafts are excluded — saving one shouldn't consume quota before it's ever published.
   */
  async countPostsThisMonth(userId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return this.prisma.post.count({
      where: { userId, createdAt: { gte: startOfMonth }, status: { not: 'DRAFT' } },
    });
  }
}
