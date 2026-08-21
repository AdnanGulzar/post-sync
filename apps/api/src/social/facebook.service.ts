import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { SocialAccount } from '@prisma/client';
import { PublishResult, ConnectedDestination, PostMetrics } from './publisher.interface';
import { PLATFORMS } from '@syncpost/platform-core';
import type { PlatformPublisher } from './publishers/publisher.registry';

const GRAPH_VERSION = 'v19.0';

// Off by default: publish_to_groups is an Advanced Access permission Meta rarely
// grants to third-party apps, and a group's own admins additionally have to add
// the app under the Group's own Settings > Apps before posting will actually work.
// Requesting it before your app truly has access can break the whole Facebook Login
// grant (Facebook may reject the entire scope list, not just drop the unknown one).
// Flip on only after confirming pages_* already works AND publish_to_groups is
// listed as usable in your app's Permissions and Features page.
const GROUPS_ENABLED = process.env.FACEBOOK_ENABLE_GROUPS === 'true';

/**
 * Facebook Page (and optionally Group) posting via the Graph API.
 * "Connecting Facebook" discovers every Page the person manages — and, only if
 * FACEBOOK_ENABLE_GROUPS=true, every Group they admin that has approved this app —
 * and returns one destination per one, each stored as its own SocialAccount row.
 * Meta doesn't support posting to personal profile timelines at all via the API.
 *
 * Requires a Meta Business-type app with "Facebook Login" (or "Facebook Login for
 * Business") set up, and pages_show_list + pages_manage_posts + pages_read_engagement
 * permissions (Standard Access works for the app's own admins/testers; App Review is
 * needed before other users can connect). Group posting additionally needs
 * publish_to_groups + groups_access_member_info, which are far more restricted.
 */
@Injectable()
export class FacebookService implements PlatformPublisher {
  readonly descriptor = PLATFORMS.FACEBOOK;

  private clientId = process.env.FACEBOOK_APP_ID || '';
  private clientSecret = process.env.FACEBOOK_APP_SECRET || '';
  private redirectUri = process.env.FACEBOOK_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const scopes = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];
    if (GROUPS_ENABLED) scopes.push('publish_to_groups', 'groups_access_member_info');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<ConnectedDestination[]> {
    const tokenRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      params: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      },
    });

    const shortLivedToken = tokenRes.data.access_token;

    // Exchange for a long-lived user token (~60 days) so publishing keeps working.
    const longLivedRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    const userAccessToken = longLivedRes.data.access_token;
    const expiresIn = longLivedRes.data.expires_in as number | undefined;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const pagesRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`, {
      params: { access_token: userAccessToken },
    });
    const pages = (pagesRes.data.data as Array<{ id: string; name: string; access_token: string }>) || [];

    const destinations: ConnectedDestination[] = pages.map((page) => ({
      platformUserId: page.id,
      platformUsername: page.name,
      destinationType: 'PAGE',
      accessToken: page.access_token, // page access token, used directly for posting
      tokenExpiresAt,
      metadata: { kind: 'page' },
    }));

    if (GROUPS_ENABLED) {
      try {
        const groupsRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/me/groups`, {
          params: { fields: 'id,name,administrator', access_token: userAccessToken },
        });
        const groups = (groupsRes.data.data as Array<{ id: string; name: string; administrator?: boolean }>) || [];
        for (const group of groups) {
          destinations.push({
            platformUserId: group.id,
            platformUsername: group.name,
            destinationType: 'GROUP',
            // Groups post with the user's own long-lived token, not a page token.
            accessToken: userAccessToken,
            tokenExpiresAt,
            metadata: { kind: 'group' },
          });
        }
      } catch {
        // publish_to_groups not actually granted, or no eligible groups — degrade
        // gracefully rather than failing the whole connect attempt over an optional extra.
      }
    }

    if (destinations.length === 0) {
      throw new InternalServerErrorException(
        'No Facebook Pages found for this account. You need to manage at least one Page to publish.',
      );
    }

    return destinations;
  }

  // Facebook natively schedules Page feed/photo posts: passing published=false +
  // scheduled_publish_time (unix seconds, 10 min - 75 days out) makes Meta hold and
  // auto-publish the post itself. Groups don't support this — always publish immediately.
  async publish(account: SocialAccount, content: string, imageUrl?: string, scheduledAt?: Date): Promise<PublishResult> {
    const canSchedule = scheduledAt && account.destinationType === 'PAGE';
    const scheduleParams = canSchedule
      ? { published: false, scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000) }
      : {};

    try {
      if (imageUrl) {
        // Fetch the image ourselves and upload the bytes directly, rather than passing
        // `url` and making Facebook's servers fetch it — that fails for anything not
        // publicly reachable from Meta's side (e.g. a local dev upload at localhost).
        const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const form = new FormData();
        form.append('source', Buffer.from(imageRes.data), { filename: 'image.jpg' });
        form.append('caption', content);
        form.append('access_token', account.accessToken);
        if (canSchedule) {
          form.append('published', 'false');
          form.append('scheduled_publish_time', String(Math.floor(scheduledAt.getTime() / 1000)));
        }

        const res = await axios.post(`https://graph.facebook.com/${GRAPH_VERSION}/${account.platformUserId}/photos`, form, {
          headers: form.getHeaders(),
        });
        return { platformPostId: res.data.post_id || res.data.id };
      }

      const res = await axios.post(`https://graph.facebook.com/${GRAPH_VERSION}/${account.platformUserId}/feed`, null, {
        params: { message: content, access_token: account.accessToken, ...scheduleParams },
      });
      return { platformPostId: res.data.id };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Facebook publish failed: ${err.response?.data?.error?.message || err.message}`,
      );
    }
  }

  // Also used to cancel a not-yet-published, natively-scheduled Page post.
  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    try {
      await axios.delete(`https://graph.facebook.com/${GRAPH_VERSION}/${platformPostId}`, {
        params: { access_token: account.accessToken },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Facebook delete failed: ${err.response?.data?.error?.message || err.message}`,
      );
    }
  }

  async editPost(account: SocialAccount, platformPostId: string, content: string): Promise<void> {
    try {
      await axios.post(`https://graph.facebook.com/${GRAPH_VERSION}/${platformPostId}`, null, {
        params: { message: content, access_token: account.accessToken },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Facebook edit failed: ${err.response?.data?.error?.message || err.message}`,
      );
    }
  }

  async getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    try {
      const res = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${platformPostId}`, {
        params: {
          fields: 'likes.summary(true),comments.summary(true),shares',
          access_token: account.accessToken,
        },
      });
      return {
        likes: res.data.likes?.summary?.total_count,
        comments: res.data.comments?.summary?.total_count,
        shares: res.data.shares?.count,
      };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Could not fetch Facebook metrics: ${err.response?.data?.error?.message || err.message}`,
      );
    }
  }
}
