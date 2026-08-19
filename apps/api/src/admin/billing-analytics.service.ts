import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class BillingAnalyticsService {
  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
  ) {}

  async getOverview() {
    const subscriptions = await this.prisma.subscription.findMany({ include: { plan: true } });

    const byStatus: Record<SubscriptionStatus, number> = { ACTIVE: 0, INACTIVE: 0, EXPIRED: 0 };
    for (const s of subscriptions) byStatus[s.status] += 1;

    const byPlanMap = new Map<
      string,
      { planId: string; name: string; price: number; subscribers: number; mrr: number }
    >();
    for (const s of subscriptions) {
      if (s.status !== 'ACTIVE') continue;
      const entry = byPlanMap.get(s.planId) ?? {
        planId: s.planId,
        name: s.plan.name,
        price: s.plan.price,
        subscribers: 0,
        mrr: 0,
      };
      entry.subscribers += 1;
      entry.mrr += s.plan.price;
      byPlanMap.set(s.planId, entry);
    }
    const byPlan = [...byPlanMap.values()].sort((a, b) => b.mrr - a.mrr);
    const mrr = byPlan.reduce((sum, p) => sum + p.mrr, 0);

    const recentPayments = await this.getRecentPayments();

    return {
      totalSubscribers: subscriptions.length,
      byStatus,
      byPlan,
      mrr,
      recentPayments,
    };
  }

  // Best-effort — the rest of the dashboard (subscriber counts, MRR) comes straight
  // from our own DB and works with or without Stripe configured; only this list
  // needs a live Stripe call, so a missing key or API hiccup just empties it out.
  private async getRecentPayments(): Promise<{
    available: boolean;
    payments: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: string;
      userName: string | null;
      userEmail: string | null;
      planName: string | null;
    }[];
  }> {
    let charges;
    try {
      charges = await this.stripeService.listRecentCharges(20);
    } catch {
      return { available: false, payments: [] };
    }

    const customerIds = charges.map((c) => c.customerId).filter((id): id is string => !!id);
    const users = customerIds.length
      ? await this.prisma.user.findMany({
          where: { subscription: { stripeCustomerId: { in: customerIds } } },
          include: { subscription: { include: { plan: true } } },
        })
      : [];
    const userByCustomerId = new Map(users.map((u) => [u.subscription?.stripeCustomerId as string, u]));

    return {
      available: true,
      payments: charges.map((c) => {
        const user = c.customerId ? userByCustomerId.get(c.customerId) : undefined;
        return {
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          createdAt: c.created,
          userName: user?.name ?? null,
          userEmail: user?.email ?? c.email ?? null,
          planName: user?.subscription?.plan.name ?? null,
        };
      }),
    };
  }
}
