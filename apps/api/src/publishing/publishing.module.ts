import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { PublishingWorker } from './publishing.worker';

/**
 * Scheduled publishing, separated from the request-serving modules.
 *
 * The @Cron used to live on PostsService, which the HTTP controller also uses,
 * so every API pod was implicitly a worker. WORKER_ENABLED=false now turns the
 * scheduling off on pods that should only serve requests.
 */
@Module({
  imports: [PostsModule],
  providers: [PublishingWorker],
})
export class PublishingModule {}
