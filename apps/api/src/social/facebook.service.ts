import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { SocialAccount } from '@prisma/client';
import { SocialPlatformService, PublishResult } from './publisher.interface';

const GRAPH_VERSION = 'v19.0';

/**
 * Facebook Page posting via the Graph API.
 * Note: Meta only allows posting through the API to Pages the user manages
 * (not personal profile feeds), so "connecting Facebook" here means:
 * user logs in -> we list their Pages -> we store the first Page's
 * page access token and use that to publish.
 *
 * Requires a Meta app (https://developers.facebook.com/apps) with the
 * "Facebook Login" product, and pages_show_list + pages_manage_posts permissions
 * (the latter requires App Review before it works for accounts other than
 * admins/testers of your app).
 */
@Injectable()
export class FacebookService implements SocialPlatformService {
  private clientId = process.env.FACEBOOK_APP_ID || '';
  private clientSecret = process.env.FACEBOOK_APP_SECRET || '';
  private redirectUri = process.env.FACEBOOK_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'pages_show_list,pages_manage_posts,pages_read_engagement',
      response_type: 'code',
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async handleCallback(code: string) {
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

    const pagesRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`, {
      params: { access_token: userAccessToken },
    });

    const pages = pagesRes.data.data as Array<{ id: string; name: string; access_token: string }>;
    if (!pages || pages.length === 0) {
      throw new InternalServerErrorException(
        'No Facebook Pages found for this account. You need to manage at least one Page to publish.',
      );
    }

    const primaryPage = pages[0];

    return {
      platformUserId: primaryPage.id,
      platformUsername: primaryPage.name,
      accessToken: primaryPage.access_token, // page access token, used directly for posting
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      metadata: { pages: pages.map((p) => ({ id: p.id, name: p.name })) },
    };
  }

  // Facebook natively schedules feed/photo posts: passing published=false + scheduled_publish_time
  // (unix seconds, 10 min - 75 days out) makes Meta hold and auto-publish the post itself.
  async publish(account: SocialAccount, content: string, imageUrl?: string, scheduledAt?: Date): Promise<PublishResult> {
    const scheduleParams = scheduledAt
      ? { published: false, scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000) }
      : {};

    try {
      if (imageUrl) {
        const res = await axios.post(`https://graph.facebook.com/${GRAPH_VERSION}/${account.platformUserId}/photos`, null, {
          params: { url: imageUrl, caption: content, access_token: account.accessToken, ...scheduleParams },
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

  // Also used to cancel a not-yet-published, natively-scheduled post.
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
}
