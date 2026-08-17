import { Body, Controller, Get, Param, ParseEnumPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SocialPlatform } from '@prisma/client';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  // Public: the frontend calls this to get the "Continue with <platform>" URL.
  @Get('oauth/:platform')
  getOAuthUrl(@Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform) {
    return { url: this.authService.getOAuthUrl(platform) };
  }

  // Public: the provider redirects the user's browser here after they approve access.
  // There is no JWT yet — this either logs an existing user in or creates a new
  // account, then hands a JWT back to the SPA via a query param redirect.
  @Get('oauth/:platform/callback')
  async oauthCallback(
    @Param('platform', new ParseEnumPipe(SocialPlatform)) platform: SocialPlatform,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const userAppUrl = process.env.USER_APP_URL || 'http://localhost:4220';
    try {
      const { accessToken } = await this.authService.handleOAuthCallback(platform, code, state);
      return res.redirect(`${userAppUrl}/oauth/callback?token=${accessToken}`);
    } catch (err: any) {
      return res.redirect(`${userAppUrl}/oauth/callback?error=${encodeURIComponent(err.message || 'oauth_failed')}`);
    }
  }
}
