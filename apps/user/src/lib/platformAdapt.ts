import { SocialPlatform } from '@syncpost/api-client';

// Real per-platform text limits. Facebook's is high enough that we never need
// to touch it in practice, but it's here for completeness.
const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  X: 280,
  LINKEDIN: 3000,
  FACEBOOK: 63206,
};

/**
 * Deterministic (no AI) adaptation: if a post is too long for a platform,
 * shorten it to fit — trimming at a word boundary, preserving any trailing
 * hashtags where possible, and appending an ellipsis. Content that already
 * fits is returned unchanged.
 */
export function adaptContentForPlatform(content: string, platform: SocialPlatform): string {
  const trimmed = content.trim();
  const limit = PLATFORM_LIMITS[platform];
  if (trimmed.length <= limit) return trimmed;

  const hashtagMatch = trimmed.match(/(?:\s+#\w+)+\s*$/);
  const hashtags = hashtagMatch ? hashtagMatch[0].trim() : '';
  const body = hashtagMatch ? trimmed.slice(0, trimmed.length - hashtagMatch[0].length).trim() : trimmed;

  const ellipsis = '…';
  const reserved = hashtags ? hashtags.length + 1 : 0;
  const maxBodyLength = Math.max(0, limit - ellipsis.length - reserved);

  let cut = body.slice(0, maxBodyLength);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 0) cut = cut.slice(0, lastSpace);

  const shortened = `${cut}${ellipsis}`;
  return hashtags ? `${shortened} ${hashtags}` : shortened;
}

export function adaptForPlatforms(
  content: string,
  platforms: SocialPlatform[],
): Partial<Record<SocialPlatform, string>> {
  const result: Partial<Record<SocialPlatform, string>> = {};
  for (const platform of platforms) {
    result[platform] = adaptContentForPlatform(content, platform);
  }
  return result;
}

export function wasAdapted(content: string, platform: SocialPlatform): boolean {
  return adaptContentForPlatform(content, platform) !== content.trim();
}
