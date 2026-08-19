import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlansController } from './plans.controller';
import { BillingController } from './billing.controller';
import { BillingAnalyticsService } from './billing-analytics.service';
import { PostAnalyticsController } from './post-analytics.controller';
import { PostAnalyticsService } from './post-analytics.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [SubscriptionsModule, StripeModule],
  controllers: [AdminController, PlansController, BillingController, PostAnalyticsController],
  providers: [AdminService, BillingAnalyticsService, PostAnalyticsService],
})
export class AdminModule {}
