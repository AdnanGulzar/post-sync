import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import { userAppUrl } from '../config/app-urls';

@Injectable()
export class StripeService {
  private client: Stripe | null = null;

  // Constructed lazily so a missing STRIPE_SECRET_KEY only breaks a billing
  // request, not the whole API's startup.
  private getClient(): Stripe {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new InternalServerErrorException('STRIPE_SECRET_KEY is not configured on the server.');
    }
    if (!this.client) this.client = new Stripe(process.env.STRIPE_SECRET_KEY);
    return this.client;
  }

  async createCustomer(email: string, name: string, userId: string): Promise<string> {
    const customer = await this.getClient().customers.create({ email, name, metadata: { userId } });
    return customer.id;
  }

  async createSubscriptionCheckoutSession(params: {
    customerId: string;
    priceId: string;
    userId: string;
    planId: string;
    // Set when this checkout is switching an already-paying subscriber to a
    // different paid plan — activateFromSession cancels this one once the new
    // subscription is confirmed, so they're never billed for both at once.
    previousStripeSubscriptionId?: string;
  }): Promise<string> {
    const appUrl = userAppUrl();
    const metadata = {
      userId: params.userId,
      planId: params.planId,
      ...(params.previousStripeSubscriptionId ? { previousStripeSubscriptionId: params.previousStripeSubscriptionId } : {}),
    };
    const session = await this.getClient().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancelled`,
      metadata,
      subscription_data: { metadata },
    });

    if (!session.url) throw new InternalServerErrorException('Stripe did not return a checkout URL.');
    return session.url;
  }

  retrieveCheckoutSession(sessionId: string) {
    return this.getClient().checkout.sessions.retrieve(sessionId);
  }

  // Best-effort: used when a plan switch or downgrade-to-free means an existing
  // Stripe subscription should stop billing. Swallows errors since the target may
  // already be canceled (or never existed) — never let this block the plan change.
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.getClient().subscriptions.cancel(subscriptionId);
    } catch {
      // already canceled / doesn't exist — nothing more to do
    }
  }

  // For the admin billing dashboard's "recent payments" list. Throws (caller's
  // job to handle) if Stripe isn't configured at all.
  async listRecentCharges(limit = 20) {
    const charges = await this.getClient().charges.list({ limit });
    return charges.data.map((c) => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency,
      status: c.status,
      customerId: (typeof c.customer === 'string' ? c.customer : c.customer?.id) ?? null,
      email: c.billing_details?.email ?? c.receipt_email ?? null,
      created: new Date(c.created * 1000).toISOString(),
    }));
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET is not configured on the server.');
    return this.getClient().webhooks.constructEvent(rawBody, signature, secret);
  }
}
