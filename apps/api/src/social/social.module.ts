import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { OAuthStateService } from './oauth-state.service';
import { LinkedInService } from './linkedin.service';
import { FacebookService } from './facebook.service';
import { TwitterService } from './twitter.service';
import { HttpClient } from './publishers/http-client';
import { PLATFORM_PUBLISHER, PublisherRegistry } from './publishers/publisher.registry';

/**
 * Every platform publisher is registered under the same multi-provider token,
 * so {@link PublisherRegistry} can collect them without anyone maintaining a
 * list. Adding a platform means adding one entry here and one descriptor in
 * `@syncpost/platform-core` — the registry refuses to boot if those disagree.
 */
const PUBLISHERS = [LinkedInService, FacebookService, TwitterService];

@Module({
  controllers: [SocialController],
  providers: [
    SocialService,
    OAuthStateService,
    HttpClient,
    PublisherRegistry,
    ...PUBLISHERS,
    ...PUBLISHERS.map((useExisting) => ({
      provide: PLATFORM_PUBLISHER,
      useExisting,
      multi: true,
    })),
  ],
  exports: [SocialService],
})
export class SocialModule {}
