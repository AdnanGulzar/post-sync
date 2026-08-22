import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialAccount } from '@prisma/client';
import { PublishResult, ConnectedDestination, PostMetrics } from './publisher.interface';
import { PLATFORMS } from '@syncpost/platform-core';
import type { PlatformPublisher } from './publishers/publisher.registry';
import { BasePublisher } from './publishers/base-publisher';
import { HttpClient } from './publishers/http-client';

const API_BASE = 'https://api.linkedin.com/v2';
const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// Off by default: r_organization_admin / w_organization_social require LinkedIn's
// Marketing Developer Platform partner approval — a formal application review, not
// something a normal app gets by just adding testers. Requesting these scopes before
// your app has that access will make the whole LinkedIn login grant fail. Flip on only
// after LinkedIn has actually approved these scopes for your app.
const ORGANIZATIONS_ENABLED = process.env.LINKEDIN_ENABLE_ORGANIZATIONS === 'true';

const MEMBER_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
const ORGANIZATION_SCOPES = ['w_organization_social', 'r_organization_admin'];

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

interface UserInfo {
  sub: string;
  name: string;
  email?: string;
}

interface RegisterUploadResponse {
  value: {
    asset: string;
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string };
    };
  };
}

/**
 * LinkedIn "Share on LinkedIn" (w_member_social) integration, plus optional Company
 * Page posting (w_organization_social) behind LINKEDIN_ENABLE_ORGANIZATIONS.
 * Requires a LinkedIn app (https://www.linkedin.com/developers/apps) with the
 * "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products added.
 */
@Injectable()
export class LinkedInService extends BasePublisher implements PlatformPublisher {
  readonly descriptor = PLATFORMS.LINKEDIN;

  private readonly clientId = process.env.LINKEDIN_CLIENT_ID || '';
  private readonly clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
  private readonly redirectUri = process.env.LINKEDIN_REDIRECT_URI || '';

  constructor(http: HttpClient) {
    super(http);
  }

  /** LinkedIn puts the reason at the top level under `message`. */
  protected errorDetail(body: unknown): string | undefined {
    return (body as { message?: string } | undefined)?.message;
  }

  getAuthUrl(state: string): string {
    const scopes = ORGANIZATIONS_ENABLED
      ? [...MEMBER_SCOPES, ...ORGANIZATION_SCOPES]
      : MEMBER_SCOPES;
    return this.authUrl(AUTHORIZE_URL, {
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: scopes.join(' '),
    });
  }

  async handleCallback(code: string): Promise<ConnectedDestination[]> {
    const token = await this.request<TokenResponse>({
      method: 'POST',
      url: TOKEN_URL,
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = token.access_token;
    const tokenExpiresAt = this.expiresAt(token.expires_in);

    const profile = await this.request<UserInfo>({
      method: 'GET',
      url: `${API_BASE}/userinfo`,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const destinations: ConnectedDestination[] = [
      {
        platformUserId: profile.sub,
        platformUsername: profile.name,
        destinationType: 'PERSONAL',
        accessToken,
        tokenExpiresAt,
        metadata: { email: profile.email },
      },
    ];

    if (ORGANIZATIONS_ENABLED) {
      destinations.push(...(await this.discoverOrganizations(accessToken, tokenExpiresAt)));
    }

    return destinations;
  }

  /**
   * Finds Company Pages the member administers.
   *
   * @param accessToken - The member's access token.
   * @param tokenExpiresAt - Expiry carried over from the token exchange.
   * @returns Organization destinations, or an empty list when
   *          r_organization_admin was not actually granted — connecting should
   *          still succeed for the personal profile.
   */
  private async discoverOrganizations(
    accessToken: string,
    tokenExpiresAt: Date | undefined,
  ): Promise<ConnectedDestination[]> {
    try {
      const res = await this.request<{
        elements?: Array<{ 'organization~'?: { id: number; localizedName: string } }>;
      }>({
        method: 'GET',
        url:
          `${API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR` +
          `&projection=(elements*(organization~(id,localizedName)))`,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return (res.elements ?? []).flatMap((el) => {
        const org = el['organization~'];
        if (!org) return [];
        return [
          {
            platformUserId: String(org.id),
            platformUsername: org.localizedName,
            destinationType: 'PAGE' as const,
            accessToken,
            tokenExpiresAt,
            metadata: { kind: 'organization' },
          },
        ];
      });
    } catch {
      return [];
    }
  }

  /**
   * Uploads an image and returns its asset URN.
   *
   * LinkedIn only accepts a raw `originalUrl` for link-preview shares (where it
   * scrapes the page itself). An actual image attachment has to be registered,
   * uploaded as bytes, then referenced by URN.
   *
   * @see https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/images-api
   */
  private async uploadImage(
    accessToken: string,
    ownerUrn: string,
    imageUrl: string,
  ): Promise<string> {
    const registered = await this.request<RegisterUploadResponse>({
      method: 'POST',
      url: `${API_BASE}/assets?action=registerUpload`,
      data: {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: ownerUrn,
          serviceRelationships: [
            { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
          ],
        },
      },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });

    const uploadUrl =
      registered.value.uploadMechanism[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ].uploadUrl;

    const bytes = await this.request<ArrayBuffer>({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
    });

    await this.request({
      method: 'PUT',
      url: uploadUrl,
      data: bytes,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
    });

    return registered.value.asset;
  }

  private authorUrnFor(account: SocialAccount): string {
    return account.destinationType === 'PAGE'
      ? `urn:li:organization:${account.platformUserId}`
      : `urn:li:person:${account.platformUserId}`;
  }

  async publish(account: SocialAccount, content: string, imageUrl?: string): Promise<PublishResult> {
    const authorUrn = this.authorUrnFor(account);
    const asset = imageUrl
      ? await this.uploadImage(account.accessToken, authorUrn, imageUrl)
      : undefined;

    const body = {
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

    // The created post's id comes back in a header, not the body.
    const res = await this.requestRaw<{ id?: string }>({
      method: 'POST',
      url: `${API_BASE}/ugcPosts`,
      data: body,
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    const restliId = res.headers['x-restli-id'];
    return {
      platformPostId: (typeof restliId === 'string' ? restliId : undefined) ?? res.data?.id ?? 'unknown',
    };
  }

  async deletePost(account: SocialAccount, platformPostId: string): Promise<void> {
    await this.request({
      method: 'DELETE',
      url: `${API_BASE}/ugcPosts/${encodeURIComponent(platformPostId)}`,
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
  }

  /**
   * Not supported by LinkedIn's public API, which has no endpoint to edit a UGC
   * post's content after publish.
   *
   * @throws {BadRequestException} Always. Callers should check
   *         `descriptor.capabilities.edit` first.
   */
  async editPost(): Promise<void> {
    throw new BadRequestException(
      "LinkedIn doesn't support editing a published post through its API — delete it and post again instead.",
    );
  }

  // The socialActions endpoint works with just the member's own token (no Marketing
  // Developer Platform approval needed), but only surfaces likes + top-level comments —
  // impressions/shares require the restricted organizationalEntityShareStatistics API.
  async getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    const res = await this.request<{
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { totalFirstLevelComments?: number };
    }>({
      method: 'GET',
      url: `${API_BASE}/socialActions/${encodeURIComponent(platformPostId)}`,
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    return {
      likes: res.likesSummary?.totalLikes,
      comments: res.commentsSummary?.totalFirstLevelComments,
    };
  }
}
