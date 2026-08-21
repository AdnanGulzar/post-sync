import { Injectable } from '@nestjs/common';
import axios from 'axios';

const GRAPH_VERSION = 'v19.0';

/**
 * Facebook OAuth for "Sign up / Log in with Facebook".
 * Requests Page-posting permissions in the same grant as login, so signing up
 * with Facebook also connects a managed Page for publishing — no separate
 * "Connect" step. If the person doesn't manage any Page, sign-in still
 * succeeds; they just won't have a Facebook account connected yet.
 * Requires the "Facebook Login" product on the Meta app
 * (https://developers.facebook.com/apps).
 */
@Injectable()
export class FacebookIdentityService {
  private clientId = process.env.FACEBOOK_APP_ID || '';
  private clientSecret = process.env.FACEBOOK_APP_SECRET || '';
  private redirectUri = process.env.FACEBOOK_AUTH_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'email public_profile pages_show_list pages_manage_posts pages_read_engagement',
      response_type: 'code',
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async fetchIdentity(code: string) {
    const tokenRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      params: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      },
    });
    const shortLivedToken = tokenRes.data.access_token as string;

    const meRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/me`, {
      params: { fields: 'id,name,email', access_token: shortLivedToken },
    });

    const identity = {
      platformUserId: meRes.data.id as string,
      email: meRes.data.email as string | undefined,
      name: (meRes.data.name as string) || 'Facebook User',
    };

    // Exchange for a long-lived user token (~60 days) so the connected Page keeps working,
    // then look up Pages the person manages — publishing only works against a Page.
    const longLivedRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    const userAccessToken = longLivedRes.data.access_token as string;
    const expiresIn = longLivedRes.data.expires_in as number | undefined;

    const pagesRes = await axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`, {
      params: { access_token: userAccessToken },
    });
    const pages = pagesRes.data.data as Array<{ id: string; name: string; access_token: string }>;

    // Destructure rather than index: this narrows `primaryPage` for the compiler
    // and covers the empty-array case in the same check.
    const [primaryPage] = pages ?? [];
    if (!primaryPage) {
      // No managed Page — sign-in still succeeds, just without an auto-connected account.
      return identity;
    }
    return {
      ...identity,
      connect: {
        platformUserId: primaryPage.id,
        platformUsername: primaryPage.name,
        accessToken: primaryPage.access_token,
        tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        metadata: { pages: pages.map((p) => ({ id: p.id, name: p.name })) },
      },
    };
  }
}
