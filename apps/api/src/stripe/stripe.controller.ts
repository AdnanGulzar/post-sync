import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from '../subscriptions/plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StripeService } from './stripe.service';

@Controller('stripe')
export class StripeController {
  constructor(
    private stripeService: StripeService,
    private plansService: PlansService,
    private prisma: PrismaService,
  ) {}

  // Public: Stripe calls this directly. Needs the raw request body to verify
  // the signature, which is why main.ts enables `rawBody` on the Nest app.
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody || !signature) throw new BadRequestException('Missing Stripe signature or body.');

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.activateFromSession(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.syncSubscriptionStatus(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: 'EXPIRED' },
        });
        break;
      }
    }

    return { received: true };
  }

  // Fallback for local dev / any delay before the webhook lands: the billing-success
  // page calls this with the session it was redirected back with, and we confirm +
  // activate synchronously against Stripe instead of waiting on the webhook.
  @UseGuards(JwtAuthGuard)
  @Get('checkout-session/:sessionId')
  async checkSession(@CurrentUser() user: any, @Param('sessionId') sessionId: string) {
    const session = await this.stripeService.retrieveCheckoutSession(sessionId);
    if (session.metadata?.userId !== user.id) throw new ForbiddenException();

    if (session.status === 'complete' || session.payment_status === 'paid') {
      await this.activateFromSession(session);
      return { status: 'active' as const };
    }
    return { status: 'pending' as const };
  }

  // Lets someone who abandoned or failed checkout start a fresh session for the
  // paid plan they already picked at signup, without re-registering.
  @UseGuards(JwtAuthGuard)
  @Post('checkout-session')
  async createCheckoutSession(@CurrentUser() user: any) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
      include: { plan: true },
    });
    if (!subscription) throw new BadRequestException('No subscription found for this account.');
    if (subscription.plan.price === 0) {
      throw new BadRequestException("The plan you're on doesn't require payment.");
    }
    if (!subscription.plan.stripePriceId) {
      throw new BadRequestException(`The "${subscription.plan.name}" plan isn't fully set up for payment yet.`);
    }

    const customerId =
      subscription.stripeCustomerId ?? (await this.stripeService.createCustomer(user.email, user.name, user.id));
    if (!subscription.stripeCustomerId) {
      await this.prisma.subscription.update({ where: { userId: user.id }, data: { stripeCustomerId: customerId } });
    }

    const checkoutUrl = await this.stripeService.createSubscriptionCheckoutSession({
      customerId,
      priceId: subscription.plan.stripePriceId,
      userId: user.id,
      planId: subscription.planId,
    });
    return { checkoutUrl };
  }

  private async activateFromSession(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        status: 'ACTIVE',
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        stripeSubscriptionId:
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
      },
    });
  }

  private async syncSubscriptionStatus(sub: Stripe.Subscription) {
    const status =
      sub.status === 'active' || sub.status === 'trialing'
        ? 'ACTIVE'
        : sub.status === 'canceled' || sub.status === 'unpaid'
          ? 'EXPIRED'
          : 'INACTIVE';
    await this.prisma.subscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status } });
  }
}
