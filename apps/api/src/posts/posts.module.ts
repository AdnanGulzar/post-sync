import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { SocialModule } from '../social/social.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SocialModule, SubscriptionsModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
