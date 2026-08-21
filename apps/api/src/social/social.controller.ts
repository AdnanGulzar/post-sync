import { Controller, Delete, Get, Param, ParseEnumPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SocialPlatform } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SocialService } from './social.service';
import { ParseEntityIdPipe } from '../common/pipes/parse-entity-id.pipe';

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
      const accounts = await this.socialService.handleCallback(platform, code, state);
      return res.redirect(
        `${userAppUrl}/connections?connected=${platform.toLowerCase()}&count=${accounts.length}`,
      );
    } catch (err: any) {
      return res.redirect(`${userAppUrl}/connections?error=${encodeURIComponent(err.message || 'connect_failed')}`);
    }
  }

  // Targets a specific connected destination (a user can have more than one per platform).
  @UseGuards(JwtAuthGuard)
  @Delete('accounts/:id')
  disconnect(@CurrentUser() user: any, @Param('id', ParseEntityIdPipe) id: string) {
    return this.socialService.disconnect(user.id, id);
  }
}
