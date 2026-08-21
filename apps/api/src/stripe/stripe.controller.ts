import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
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
import { AuthenticatedUser } from '../common/decorators/authenticated-user';
import { StripeService } from './stripe.service';
import { CheckoutSessionDto } from './dto/checkout-session.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { errorMessage } from '../common/errors';

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
    } catch (err: unknown) {
      throw new BadRequestException(`Webhook signature verification failed: ${errorMessage(err)}`);
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
  async checkSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    const session = await this.stripeService.retrieveCheckoutSession(sessionId);
    if (session.metadata?.userId !== user.id) throw new ForbiddenException();

    if (session.status === 'complete' || session.payment_status === 'paid') {
      await this.activateFromSession(session);
      return { status: 'active' as const };
    }
    return { status: 'pending' as const };
  }

  // Starts checkout for a paid plan — either a fresh session for the plan already
  // picked at signup (no body, e.g. after an abandoned/failed checkout), or a
  // switch to a different paid plan (planId in the body, from the billing page).
  @UseGuards(JwtAuthGuard)
  @Post('checkout-session')
  async createCheckoutSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutSessionDto) {
    const planId = dto.planId;
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
      include: { plan: true },
    });
    if (!subscription) throw new BadRequestException('No subscription found for this account.');

    const targetPlan = planId ? await this.plansService.findByIdOrThrow(planId) : subscription.plan;
    if (!targetPlan.isActive && targetPlan.id !== subscription.planId) {
      throw new BadRequestException('This plan is no longer available — pick another.');
    }
    if (targetPlan.price === 0) {
      throw new BadRequestException("The plan you're on doesn't require payment.");
    }
    if (!targetPlan.stripePriceId) {
      throw new BadRequestException(`The "${targetPlan.name}" plan isn't fully set up for payment yet.`);
    }

    const customerId =
      subscription.stripeCustomerId ?? (await this.stripeService.createCustomer(user.email, user.name, user.id));
    if (!subscription.stripeCustomerId) {
      await this.prisma.subscription.update({ where: { userId: user.id }, data: { stripeCustomerId: customerId } });
    }

    const checkoutUrl = await this.stripeService.createSubscriptionCheckoutSession({
      customerId,
      priceId: targetPlan.stripePriceId,
      userId: user.id,
      planId: targetPlan.id,
      // Switching plans while already paying — cancel the old subscription once
      // the new one is confirmed, so they're never billed for both at once.
      previousStripeSubscriptionId:
        targetPlan.id !== subscription.planId ? subscription.stripeSubscriptionId ?? undefined : undefined,
    });
    return { checkoutUrl };
  }

  // Switches to a free plan — no Stripe checkout needed, but any existing paid
  // subscription must be cancelled so they stop being billed for it.
  @UseGuards(JwtAuthGuard)
  @Patch('change-plan')
  async changePlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePlanDto) {
    const planId = dto.planId;

    const subscription = await this.prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!subscription) throw new BadRequestException('No subscription found for this account.');

    const plan = await this.plansService.findByIdOrThrow(planId);
    if (!plan.isActive) throw new BadRequestException('This plan is no longer available — pick another.');
    if (plan.price > 0) {
      throw new BadRequestException('This plan requires payment — start checkout instead.');
    }

    if (subscription.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription(subscription.stripeSubscriptionId);
    }

    return this.prisma.subscription.update({
      where: { userId: user.id },
      data: { planId: plan.id, status: 'ACTIVE', stripeSubscriptionId: null },
      include: { plan: true },
    });
  }

  private async activateFromSession(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const previousStripeSubscriptionId = session.metadata?.previousStripeSubscriptionId;
    if (!userId) return;

    const newSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

    await this.prisma.subscription.updateMany({
      where: { userId },
      data: {
        status: 'ACTIVE',
        ...(planId ? { planId } : {}),
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        stripeSubscriptionId: newSubscriptionId,
      },
    });

    if (previousStripeSubscriptionId && previousStripeSubscriptionId !== newSubscriptionId) {
      await this.stripeService.cancelSubscription(previousStripeSubscriptionId);
    }
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
