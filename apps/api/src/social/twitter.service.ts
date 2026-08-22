import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialAccount } from '@prisma/client';
import { PLATFORMS } from '@syncpost/platform-core';
import { PublishResult, ConnectedDestination, PostMetrics } from './publisher.interface';
import { BasePublisher } from './publishers/base-publisher';
import { HttpClient } from './publishers/http-client';
import { codeChallengeFor } from './publishers/pkce';
import type { PlatformPublisher } from './publishers/publisher.registry';
import type {
  RefreshableTokenSource,
  RefreshedTokens,
  StoredCredentials,
} from './tokens/refreshable';
import { PermanentError } from './publishers/publisher.errors';

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const API_BASE = 'https://api.twitter.com/2';

/** Scopes required to post, read back metrics, and refresh without re-consent. */
const SCOPES = 'tweet.read tweet.write users.read offline.access';

/** Shape of the token endpoint's response, narrowed to what is used. */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

@Injectable()
export class TwitterService
  extends BasePublisher
  implements PlatformPublisher, RefreshableTokenSource
{
  readonly descriptor = PLATFORMS.X;

  private readonly clientId = process.env.X_CLIENT_ID || '';
  private readonly clientSecret = process.env.X_CLIENT_SECRET || '';
  private readonly redirectUri = process.env.X_REDIRECT_URI || '';

  constructor(http: HttpClient) {
    super(http);
  }

  /** X nests the reason under `detail`. */
  protected errorDetail(body: unknown): string | undefined {
    return (body as { detail?: string } | undefined)?.detail;
  }

  getAuthUrl(state: string, codeVerifier?: string): string {
    return this.authUrl(AUTHORIZE_URL, {
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallengeFor(codeVerifier || ''),
      code_challenge_method: 'S256',
    });
  }

  async handleCallback(code: string, codeVerifier?: string): Promise<ConnectedDestination[]> {
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const token = await this.request<TokenResponse>({
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier || '',
        client_id: this.clientId,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    });

    const me = await this.request<{ data: { id: string; username: string } }>({
      method: 'GET',
      url: `${API_BASE}/users/me`,
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    return [
      {
        platformUserId: me.data.id,
        platformUsername: me.data.username,
        destinationType: 'PERSONAL',
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt: this.expiresAt(token.expires_in),
      },
    ];
  }

  /**
   * Exchanges a refresh token for a new access token.
   *
   * X access tokens last roughly two hours, so this is the difference between
   * publishing working and the user reconnecting several times a day. X rotates
   * the refresh token on every use, so the returned one must be persisted or the
   * next refresh fails.
   *
   * @param current - The account's stored credentials; X uses `refreshToken`.
   * @returns New credentials, including the rotated refresh token.
   * @throws {TokenExpiredError} If X rejects the refresh token.
   */
  async refreshTokens(current: StoredCredentials): Promise<RefreshedTokens> {
    if (!current.refreshToken) {
      throw new PermanentError(this.descriptor.label, 'no refresh token stored for this account');
    }
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const token = await this.request<TokenResponse>({
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
        client_id: this.clientId,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    });

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: this.expiresAt(token.expires_in),
    };
  }

  async publish(account: SocialAccount, content: string): Promise<PublishResult> {
    const res = await this.request<{ data: { id: string } }>({
      method: 'POST',
      url: `${API_BASE}/tweets`,
      data: { text: content },
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    return { platformPostId: res.data.id };
  }

  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    await this.request({
      method: 'DELETE',
      url: `${API_BASE}/tweets/${platformPostId}`,
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
  }

  /**
   * Not supported by X's API.
   *
   * @throws {BadRequestException} Always. Callers should check
   *         `descriptor.capabilities.edit` first rather than relying on this.
   */
  async editPost(): Promise<void> {
    throw new BadRequestException(
      "X doesn't support editing a published post through its API — delete it and post again instead.",
    );
  }

  // impression_count is only populated for tweets the requesting user authored,
  // which is always the case here since we published them.
  async getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    const res = await this.request<{
      data?: {
        public_metrics?: {
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          impression_count?: number;
        };
      };
    }>({
      method: 'GET',
      url: `${API_BASE}/tweets/${platformPostId}`,
      params: { 'tweet.fields': 'public_metrics' },
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    const m = res.data?.public_metrics ?? {};
    return {
      likes: m.like_count,
      comments: m.reply_count,
      shares: m.retweet_count,
      impressions: m.impression_count,
    };
  }
}
