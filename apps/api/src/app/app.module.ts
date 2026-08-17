import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SocialModule } from '../social/social.module';
import { PostsModule } from '../posts/posts.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
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
