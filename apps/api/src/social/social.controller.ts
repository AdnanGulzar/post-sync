import {
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SocialPlatform } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private socialService: SocialService) {}

  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  listAccounts(@CurrentUser() user: any) {
    return this.socialService.listAccounts(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':platform/connect')
  connect(@CurrentUser() user: any, @Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform) {
    const url = this.socialService.getConnectUrl(user.id, platform);
    return { url };
  }

  // Public: the provider redirects the user's browser here after they approve access.
  // There is no JWT on this request, so we rely on the signed `state` value we minted
  // in connect() above to know which SyncPost user is connecting.
  @Get(':platform/callback')
  async callback(
    @Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const userAppUrl = process.env.USER_APP_URL || 'http://localhost:4200';
    try {
      await this.socialService.handleCallback(platform, code, state);
      return res.redirect(`${userAppUrl}/connections?connected=${platform.toLowerCase()}`);
    } catch (err: any) {
      return res.redirect(`${userAppUrl}/connections?error=${encodeURIComponent(err.message || 'connect_failed')}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':platform')
  disconnect(@CurrentUser() user: any, @Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform) {
    return this.socialService.disconnect(user.id, platform);
  }
}
