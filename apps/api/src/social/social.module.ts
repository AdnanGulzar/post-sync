import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { OAuthStateService } from './oauth-state.service';
import { LinkedInService } from './linkedin.service';
import { FacebookService } from './facebook.service';
import { TwitterService } from './twitter.service';

@Module({
  controllers: [SocialController],
  providers: [SocialService, OAuthStateService, LinkedInService, FacebookService, TwitterService],
  exports: [SocialService],
})
export class SocialModule {}
