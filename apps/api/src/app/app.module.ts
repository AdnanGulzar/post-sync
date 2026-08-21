import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthModule } from '../health/health.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SocialModule } from '../social/social.module';
import { PostsModule } from '../posts/posts.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StripeModule } from '../stripe/stripe.module';
import { validateEnv } from '../config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    AdminModule,
    SubscriptionsModule,
    SocialModule,
    PostsModule,
    UploadsModule,
    StripeModule,
  ],
})
export class AppModule {}
