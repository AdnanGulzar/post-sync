import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';
import { PlansPublicController } from './plans-public.controller';

@Module({
  controllers: [SubscriptionsController, PlansPublicController],
  providers: [SubscriptionsService, PlansService],
  exports: [SubscriptionsService, PlansService],
})
export class SubscriptionsModule {}
