import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import { SocialAccount } from '@prisma/client';
import { SocialPlatformService, PublishResult } from './publisher.interface';

/**
 * X (Twitter) API v2 posting, OAuth 2.0 with PKCE (user context).
 * Requires an app at https://developer.x.com/en/portal/dashboard with
 * OAuth 2.0 enabled and "tweet.read tweet.write users.read offline.access" scopes.
 */
@Injectable()
export class TwitterService implements SocialPlatformService {
  private clientId = process.env.X_CLIENT_ID || '';
  private clientSecret = process.env.X_CLIENT_SECRET || '';
  private redirectUri = process.env.X_REDIRECT_URI || '';

  static generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private static codeChallengeFor(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  getAuthUrl(state: string, codeVerifier?: string): string {
    const challenge = TwitterService.codeChallengeFor(codeVerifier || '');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, codeVerifier?: string) {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const tokenRes = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier || '',
        client_id: this.clientId,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      },
    );

    const accessToken = tokenRes.data.access_token;
    const refreshToken = tokenRes.data.refresh_token;
    const expiresIn = tokenRes.data.expires_in as number | undefined;

    const meRes = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      platformUserId: meRes.data.data.id,
      platformUsername: meRes.data.data.username,
      accessToken,
      refreshToken,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  }

  async publish(account: SocialAccount, content: string): Promise<PublishResult> {
    try {
      const res = await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: content },
        { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } },
      );
      return { platformPostId: res.data.data.id };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `X (Twitter) publish failed: ${err.response?.data?.detail || err.message}`,
      );
    }
  }

  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    try {
      await axios.delete(`https://api.twitter.com/2/tweets/${platformPostId}`, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(
        `X (Twitter) delete failed: ${err.response?.data?.detail || err.message}`,
      );
    }
  }

  // X's public API has no endpoint to edit a tweet's text after publish.
  async editPost(): Promise<void> {
    throw new BadRequestException(
      "X doesn't support editing a published post through its API — delete it and post again instead.",
    );
  }
}
