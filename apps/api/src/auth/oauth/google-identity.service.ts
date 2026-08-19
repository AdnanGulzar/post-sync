import { Injectable } from '@nestjs/common';
import axios from 'axios';

/**
 * Google OAuth 2.0 / OpenID Connect for "Sign up / Log in with Google".
 * Login-only — unlike the LinkedIn/Facebook/X identity services, there is no
 * `connect` result here, since Google isn't a platform SyncPost publishes to.
 * Requires an OAuth client at https://console.cloud.google.com/apis/credentials.
 */
@Injectable()
export class GoogleIdentityService {
  private clientId = process.env.GOOGLE_CLIENT_ID || '';
  private clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  private redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'openid email profile',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async fetchIdentity(code: string) {
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
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

    const profileRes = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      platformUserId: profileRes.data.sub as string,
      email: profileRes.data.email as string | undefined,
      name: (profileRes.data.name as string) || 'Google User',
    };
  }
}
