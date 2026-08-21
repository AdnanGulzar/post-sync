import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { SocialAccount } from '@prisma/client';
import { PublishResult, ConnectedDestination, PostMetrics } from './publisher.interface';
import { PLATFORMS } from '@syncpost/platform-core';
import type { PlatformPublisher } from './publishers/publisher.registry';

// Off by default: r_organization_admin / w_organization_social require LinkedIn's
// Marketing Developer Platform partner approval — a formal application review, not
// something a normal app gets by just adding testers. Requesting these scopes before
// your app has that access will make the whole LinkedIn login grant fail. Flip on only
// after LinkedIn has actually approved these scopes for your app.
const ORGANIZATIONS_ENABLED = process.env.LINKEDIN_ENABLE_ORGANIZATIONS === 'true';

/**
 * LinkedIn "Share on LinkedIn" (w_member_social) integration, plus optional Company
 * Page posting (w_organization_social) behind LINKEDIN_ENABLE_ORGANIZATIONS.
 * Requires a LinkedIn app (https://www.linkedin.com/developers/apps) with the
 * "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products added.
 */
@Injectable()
export class LinkedInService implements PlatformPublisher {
  readonly descriptor = PLATFORMS.LINKEDIN;

  private clientId = process.env.LINKEDIN_CLIENT_ID || '';
  private clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
  private redirectUri = process.env.LINKEDIN_REDIRECT_URI || '';

  getAuthUrl(state: string): string {
    const scopes = ['openid', 'profile', 'email', 'w_member_social'];
    if (ORGANIZATIONS_ENABLED) scopes.push('w_organization_social', 'r_organization_admin');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<ConnectedDestination[]> {
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

    const accessToken = tokenRes.data.access_token;
    const expiresIn = tokenRes.data.expires_in as number | undefined;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const destinations: ConnectedDestination[] = [
      {
        platformUserId: profileRes.data.sub,
        platformUsername: profileRes.data.name,
        destinationType: 'PERSONAL',
        accessToken,
        tokenExpiresAt,
        metadata: { email: profileRes.data.email },
      },
    ];

    if (ORGANIZATIONS_ENABLED) {
      try {
        const orgsRes = await axios.get(
          'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const elements = (orgsRes.data.elements as Array<{ 'organization~': { id: number; localizedName: string } }>) || [];
        for (const el of elements) {
          const org = el['organization~'];
          if (!org) continue;
          destinations.push({
            platformUserId: String(org.id),
            platformUsername: org.localizedName,
            destinationType: 'PAGE',
            accessToken,
            tokenExpiresAt,
            metadata: { kind: 'organization' },
          });
        }
      } catch {
        // r_organization_admin not actually granted, or no admin'd organizations —
        // degrade gracefully rather than failing the whole connect attempt.
      }
    }

    return destinations;
  }

  /**
   * LinkedIn only accepts a raw `originalUrl` for link-preview shares (where
   * it scrapes the page itself). An actual image attachment has to be
   * uploaded as bytes through their asset API and referenced by URN —
   * https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/images-api
   */
  private async uploadImage(accessToken: string, ownerUrn: string, imageUrl: string): Promise<string> {
    const registerRes = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: ownerUrn,
          serviceRelationships: [
            { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    const uploadUrl =
      registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
        .uploadUrl;
    const asset = registerRes.data.value.asset as string;

    const imageBytes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, imageBytes.data, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
    });

    return asset;
  }

  private authorUrnFor(account: SocialAccount): string {
    return account.destinationType === 'PAGE'
      ? `urn:li:organization:${account.platformUserId}`
      : `urn:li:person:${account.platformUserId}`;
  }

  async publish(account: SocialAccount, content: string, imageUrl?: string): Promise<PublishResult> {
    try {
      const authorUrn = this.authorUrnFor(account);
      const asset = imageUrl ? await this.uploadImage(account.accessToken, authorUrn, imageUrl) : undefined;

      const body: any = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: asset ? 'IMAGE' : 'NONE',
            ...(asset ? { media: [{ status: 'READY', media: asset }] } : {}),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const res = await axios.post('https://api.linkedin.com/v2/ugcPosts', body, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      return { platformPostId: res.headers['x-restli-id'] || res.data?.id || 'unknown' };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `LinkedIn publish failed: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    try {
      await axios.delete(`https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(platformPostId)}`, {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });
    } catch (err: any) {
      throw new InternalServerErrorException(
        `LinkedIn delete failed: ${err.response?.data?.message || err.message}`,
      );
    }
  }

  // LinkedIn's public API has no endpoint to edit a UGC post's content after publish.
  async editPost(): Promise<void> {
    throw new BadRequestException(
      "LinkedIn doesn't support editing a published post through its API — delete it and post again instead.",
    );
  }

  // The socialActions endpoint works with just the member's own token (no Marketing
  // Developer Platform approval needed), but only surfaces likes + top-level comments —
  // impressions/shares require the restricted organizationalEntityShareStatistics API.
  async getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    try {
      const res = await axios.get(
        `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(platformPostId)}`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      return {
        likes: res.data.likesSummary?.totalLikes,
        comments: res.data.commentsSummary?.totalFirstLevelComments,
      };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Could not fetch LinkedIn metrics: ${err.response?.data?.message || err.message}`,
      );
    }
  }
}
