import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { SocialAccount } from '@prisma/client';
import { PublishResult, ConnectedDestination, PostMetrics } from './publisher.interface';
import { PLATFORMS } from '@syncpost/platform-core';
import type { PlatformPublisher } from './publishers/publisher.registry';
import type {
  RefreshableTokenSource,
  RefreshedTokens,
  StoredCredentials,
} from './tokens/refreshable';
import { BasePublisher } from './publishers/base-publisher';
import { HttpClient } from './publishers/http-client';
import { PermanentError } from './publishers/publisher.errors';

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Off by default: publish_to_groups is an Advanced Access permission Meta rarely
// grants to third-party apps, and a group's own admins additionally have to add
// the app under the Group's own Settings > Apps before posting will actually work.
// Requesting it before your app truly has access can break the whole Facebook Login
// grant (Facebook may reject the entire scope list, not just drop the unknown one).
// Flip on only after confirming pages_* already works AND publish_to_groups is
// listed as usable in your app's Permissions and Features page.
const GROUPS_ENABLED = process.env.FACEBOOK_ENABLE_GROUPS === 'true';

const PAGE_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];
const GROUP_SCOPES = ['publish_to_groups', 'groups_access_member_info'];

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

interface PageEntry {
  id: string;
  name: string;
  access_token: string;
}

interface GroupEntry {
  id: string;
  name: string;
}

/**
 * Facebook Page (and optionally Group) posting via the Graph API.
 *
 * Connecting discovers every Page the person manages — and, only when
 * FACEBOOK_ENABLE_GROUPS=true, every Group they admin that has approved this app
 * — returning one destination each, stored as its own SocialAccount row. Meta
 * does not support posting to personal profile timelines through the API at all,
 * which is why the descriptor's media and scheduling capabilities are expressed
 * per destination type rather than per platform.
 *
 * Requires a Meta Business-type app with Facebook Login and
 * pages_show_list + pages_manage_posts + pages_read_engagement. Standard Access
 * covers the app's own admins and testers; App Review is needed before other
 * users can connect.
 */
@Injectable()
export class FacebookService
  extends BasePublisher
  implements PlatformPublisher, RefreshableTokenSource
{
  readonly descriptor = PLATFORMS.FACEBOOK;

  private readonly clientId = process.env.FACEBOOK_APP_ID || '';
  private readonly clientSecret = process.env.FACEBOOK_APP_SECRET || '';
  private readonly redirectUri = process.env.FACEBOOK_REDIRECT_URI || '';

  constructor(http: HttpClient) {
    super(http);
  }

  /** Meta nests the reason under `error.message`. */
  protected errorDetail(body: unknown): string | undefined {
    return (body as { error?: { message?: string } } | undefined)?.error?.message;
  }

  getAuthUrl(state: string): string {
    const scopes = GROUPS_ENABLED ? [...PAGE_SCOPES, ...GROUP_SCOPES] : PAGE_SCOPES;
    return this.authUrl(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`, {
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
    });
  }

  async handleCallback(code: string): Promise<ConnectedDestination[]> {
    const shortLived = await this.request<TokenResponse>({
      method: 'GET',
      url: `${GRAPH_BASE}/oauth/access_token`,
      params: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      },
    });

    // Exchange for a long-lived user token (~60 days) so publishing keeps working.
    const longLived = await this.request<TokenResponse>({
      method: 'GET',
      url: `${GRAPH_BASE}/oauth/access_token`,
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: shortLived.access_token,
      },
    });

    const userAccessToken = longLived.access_token;
    const tokenExpiresAt = this.expiresAt(longLived.expires_in);

    const pagesRes = await this.request<{ data?: PageEntry[] }>({
      method: 'GET',
      url: `${GRAPH_BASE}/me/accounts`,
      params: { access_token: userAccessToken },
    });

    const destinations: ConnectedDestination[] = (pagesRes.data ?? []).map((page) => ({
      platformUserId: page.id,
      platformUsername: page.name,
      destinationType: 'PAGE',
      accessToken: page.access_token, // page access token, used directly for posting
      tokenExpiresAt,
      metadata: { kind: 'page' },
    }));

    if (GROUPS_ENABLED) {
      destinations.push(...(await this.discoverGroups(userAccessToken, tokenExpiresAt)));
    }

    if (destinations.length === 0) {
      throw new PermanentError(
        this.descriptor.label,
        'no Pages found for this account. You need to manage at least one Page to publish.',
      );
    }

    return destinations;
  }

  /**
   * Finds Groups the user administers that have approved this app.
   *
   * @param userAccessToken - The long-lived user token; Groups post with this
   *                          rather than with a Page token.
   * @param tokenExpiresAt - Expiry carried over from the token exchange.
   * @returns Group destinations, or an empty list if the permission was not
   *          actually granted — connecting should still succeed on Pages alone
   *          rather than failing over an optional extra.
   */
  private async discoverGroups(
    userAccessToken: string,
    tokenExpiresAt: Date | undefined,
  ): Promise<ConnectedDestination[]> {
    try {
      const res = await this.request<{ data?: GroupEntry[] }>({
        method: 'GET',
        url: `${GRAPH_BASE}/me/groups`,
        params: { fields: 'id,name,administrator', access_token: userAccessToken },
      });
      return (res.data ?? []).map((group) => ({
        platformUserId: group.id,
        platformUsername: group.name,
        destinationType: 'GROUP' as const,
        accessToken: userAccessToken,
        tokenExpiresAt,
        metadata: { kind: 'group' },
      }));
    } catch {
      return [];
    }
  }

  /**
   * Extends a long-lived token's life.
   *
   * Meta has no refresh grant; instead an unexpired long-lived token can be
   * re-exchanged for a fresh one, resetting the ~60 day clock. That only works
   * while the current token is still valid, which is why TokenVault refreshes
   * ahead of expiry rather than on failure.
   *
   * @param current - The account's stored credentials. Meta has no refresh
   *                  token, so this consumes `accessToken` as fb_exchange_token.
   * @returns A newly issued long-lived token.
   */
  async refreshTokens(current: StoredCredentials): Promise<RefreshedTokens> {
    const token = await this.request<TokenResponse>({
      method: 'GET',
      url: `${GRAPH_BASE}/oauth/access_token`,
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: current.accessToken,
      },
    });
    return { accessToken: token.access_token, expiresAt: this.expiresAt(token.expires_in) };
  }

  // Facebook natively schedules Page feed/photo posts: passing published=false +
  // scheduled_publish_time (unix seconds, 10 min - 75 days out) makes Meta hold and
  // auto-publish the post itself. Groups don't support this — always publish immediately.
  async publish(
    account: SocialAccount,
    content: string,
    imageUrl?: string,
    scheduledAt?: Date,
  ): Promise<PublishResult> {
    const canSchedule =
      scheduledAt !== undefined &&
      this.descriptor.capabilities.nativeScheduling.includes(account.destinationType);

    if (imageUrl) {
      return this.publishPhoto(account, content, imageUrl, canSchedule ? scheduledAt : undefined);
    }

    const scheduleParams = canSchedule
      ? { published: false, scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000) }
      : {};

    const res = await this.request<{ id: string }>({
      method: 'POST',
      url: `${GRAPH_BASE}/${account.platformUserId}/feed`,
      params: { message: content, access_token: account.accessToken, ...scheduleParams },
    });
    return { platformPostId: res.id };
  }

  /**
   * Publishes a post with an image.
   *
   * Fetches the image and uploads the bytes rather than passing `url` and letting
   * Meta's servers fetch it, which fails for anything not publicly reachable from
   * Meta's side — a local dev upload on localhost, for instance.
   */
  private async publishPhoto(
    account: SocialAccount,
    content: string,
    imageUrl: string,
    scheduledAt: Date | undefined,
  ): Promise<PublishResult> {
    const image = await this.request<ArrayBuffer>({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
    });

    const form = new FormData();
    form.append('source', Buffer.from(image), { filename: 'image.jpg' });
    form.append('caption', content);
    form.append('access_token', account.accessToken);
    if (scheduledAt) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(Math.floor(scheduledAt.getTime() / 1000)));
    }

    const res = await this.request<{ post_id?: string; id: string }>({
      method: 'POST',
      url: `${GRAPH_BASE}/${account.platformUserId}/photos`,
      data: form,
      headers: form.getHeaders(),
    });
    return { platformPostId: res.post_id || res.id };
  }

  // Also used to cancel a not-yet-published, natively-scheduled Page post.
  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    await this.request({
      method: 'DELETE',
      url: `${GRAPH_BASE}/${platformPostId}`,
      params: { access_token: account.accessToken },
    });
  }

  async editPost(account: SocialAccount, platformPostId: string, content: string): Promise<void> {
    await this.request({
      method: 'POST',
      url: `${GRAPH_BASE}/${platformPostId}`,
      params: { message: content, access_token: account.accessToken },
    });
  }

  async getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    const res = await this.request<{
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    }>({
      method: 'GET',
      url: `${GRAPH_BASE}/${platformPostId}`,
      params: {
        fields: 'likes.summary(true),comments.summary(true),shares',
        access_token: account.accessToken,
      },
    });

    return {
      likes: res.likes?.summary?.total_count,
      comments: res.comments?.summary?.total_count,
      shares: res.shares?.count,
    };
  }
}
