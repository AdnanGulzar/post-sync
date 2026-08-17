import { Injectable } from '@nestjs/common';
import axios from 'axios';

/**
 * LinkedIn OAuth for "Sign up / Log in with LinkedIn".
 * Requests both "Sign In with LinkedIn using OpenID Connect" and the
 * w_member_social posting scope in one grant, so signing up with LinkedIn
 * also connects the account for publishing — no separate "Connect" step.
 * Requires both products enabled on the LinkedIn app
 * (https://www.linkedin.com/developers/apps).
 */
@Injectable()
export class LinkedInIdentityService {
  private clientId = process.env.LINKEDIN_CLIENT_ID || '';
  private clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
  private redirectUri = process.env.LINKEDIN_AUTH_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'openid profile email w_member_social',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async fetchIdentity(code: string) {
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const accessToken = tokenRes.data.access_token as string;
    const expiresIn = tokenRes.data.expires_in as number | undefined;

    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      platformUserId: profileRes.data.sub as string,
      email: profileRes.data.email as string | undefined,
      name: (profileRes.data.name as string) || 'LinkedIn User',
      // Same access token also carries w_member_social, so it doubles as the
      // account used to publish posts — no separate connect flow needed.
      connect: {
        platformUserId: profileRes.data.sub as string,
        platformUsername: profileRes.data.name as string | undefined,
        accessToken,
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      },
    };
  }
}
