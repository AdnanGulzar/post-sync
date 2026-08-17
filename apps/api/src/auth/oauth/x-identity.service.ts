import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';

/**
 * X (Twitter) OAuth 2.0 + PKCE for "Sign up / Log in with X".
 * Requests tweet.write in the same grant as login, so signing up with X also
 * connects the account for publishing — no separate "Connect" step.
 * Requires an app at https://developer.x.com/en/portal/dashboard with
 * OAuth 2.0 enabled.
 *
 * Important: X's API does not return an email address for the standard
 * (free/basic) access tier, so `email` will be undefined here. AuthService
 * falls back to a synthesized placeholder email keyed by the X user id so
 * repeat sign-ins with the same X account resolve to the same SyncPost user.
 */
@Injectable()
export class XIdentityService {
  private clientId = process.env.X_CLIENT_ID || '';
  private clientSecret = process.env.X_CLIENT_SECRET || '';
  private redirectUri = process.env.X_AUTH_REDIRECT_URI || '';

  generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private codeChallengeFor(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  getAuthUrl(state: string, codeVerifier: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge: this.codeChallengeFor(codeVerifier),
      code_challenge_method: 'S256',
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  async fetchIdentity(code: string, codeVerifier: string) {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const tokenRes = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
        client_id: this.clientId,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      },
    );

    const accessToken = tokenRes.data.access_token as string;
    const refreshToken = tokenRes.data.refresh_token as string | undefined;
    const expiresIn = tokenRes.data.expires_in as number | undefined;

    const meRes = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const platformUserId = meRes.data.data.id as string;
    const platformUsername = meRes.data.data.username as string | undefined;

    return {
      platformUserId,
      email: undefined as string | undefined,
      name: (meRes.data.data.name as string) || platformUsername || 'X User',
      connect: {
        platformUserId,
        platformUsername,
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      },
    };
  }
}
