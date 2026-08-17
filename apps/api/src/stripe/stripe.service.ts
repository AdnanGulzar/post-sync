import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';

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
  }): Promise<string> {
    const userAppUrl = process.env.USER_APP_URL || 'http://localhost:4220';
    const session = await this.getClient().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: `${userAppUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${userAppUrl}/billing/cancelled`,
      metadata: { userId: params.userId, planId: params.planId },
      subscription_data: { metadata: { userId: params.userId, planId: params.planId } },
    });

    if (!session.url) throw new InternalServerErrorException('Stripe did not return a checkout URL.');
    return session.url;
  }

  retrieveCheckoutSession(sessionId: string) {
    return this.getClient().checkout.sessions.retrieve(sessionId);
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET is not configured on the server.');
    return this.getClient().webhooks.constructEvent(rawBody, signature, secret);
  }
}
