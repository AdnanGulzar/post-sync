import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { OAuthStateService } from './oauth-state.service';
import { LinkedInService } from './linkedin.service';
import { FacebookService } from './facebook.service';
import { TwitterService } from './twitter.service';
import { HttpClient } from './publishers/http-client';
import { TokenCrypto } from './tokens/token-crypto';
import { TokenVault } from './tokens/token-vault';
import {
  PLATFORM_PUBLISHER,
  PublisherRegistry,
  type PlatformPublisher,
} from './publishers/publisher.registry';

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
    {
      // Provided by factory, not by class: TokenCrypto's constructor takes an
      // optional secret so tests can pass one, and Nest would otherwise try to
      // resolve `String` from the container and fail at boot.
      provide: TokenCrypto,
      useFactory: () => new TokenCrypto(),
    },
    TokenVault,
    ...PUBLISHERS,
    {
      // Nest has no `multi: true` (that is an Angular concept) — collecting
      // providers under one token means a factory that injects each of them
      // and returns the array.
      provide: PLATFORM_PUBLISHER,
      useFactory: (...publishers: PlatformPublisher[]) => publishers,
      inject: [...PUBLISHERS],
    },
  ],
  exports: [SocialService, TokenVault],
})
export class SocialModule {}
