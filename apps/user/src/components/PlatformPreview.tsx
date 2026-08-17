import { Globe2, Heart, MessageCircle, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import { SocialPlatform } from '@syncpost/api-client';
import { cn } from '@syncpost/ui';

interface PlatformPreviewProps {
  platform: SocialPlatform;
  authorName: string;
  handle?: string;
  content: string;
  imageUrl?: string;
}

const CHAR_LIMITS: Record<SocialPlatform, number | null> = {
  X: 280,
  LINKEDIN: 3000,
  FACEBOOK: null,
};

export function CharacterCount({ platform, content }: { platform: SocialPlatform; content: string }) {
  const limit = CHAR_LIMITS[platform];
  const count = content.length;
  const overLimit = limit !== null && count > limit;
  return (
    <p className={cn('text-xs text-muted-foreground', overLimit && 'font-medium text-destructive')}>
      {count}
      {limit !== null ? ` / ${limit}` : ''} characters{overLimit ? ' — over the limit, this post will be rejected' : ''}
    </p>
  );
}

export function PlatformPreview({ platform, authorName, handle, content, imageUrl }: PlatformPreviewProps) {
  const initial = authorName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          {platform === 'X' ? (
            <div className="flex flex-wrap items-baseline gap-1 text-sm">
              <span className="font-bold">{authorName}</span>
              <span className="text-muted-foreground">@{handle || authorName.toLowerCase().replace(/\s+/g, '')}</span>
              <span className="text-muted-foreground">· Now</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold leading-tight">{authorName}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                Now <Globe2 className="h-3 w-3" />
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {content || <span className="text-muted-foreground">Your post will appear here as you write it.</span>}
      </p>

      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className={cn(
            'mt-3 max-h-72 w-full border object-cover',
            platform === 'X' ? 'rounded-2xl' : 'rounded-md',
          )}
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      )}

      <div className="mt-3 flex items-center justify-between border-t pt-2 text-muted-foreground">
        {platform === 'X' && (
          <>
            <IconLabel icon={MessageCircle} />
            <IconLabel icon={Repeat2} />
            <IconLabel icon={Heart} />
            <IconLabel icon={Share2} />
          </>
        )}
        {platform === 'LINKEDIN' && (
          <>
            <IconLabel icon={ThumbsUp} label="Like" />
            <IconLabel icon={MessageCircle} label="Comment" />
            <IconLabel icon={Repeat2} label="Repost" />
            <IconLabel icon={Send} label="Send" />
          </>
        )}
        {platform === 'FACEBOOK' && (
          <>
            <IconLabel icon={ThumbsUp} label="Like" />
            <IconLabel icon={MessageCircle} label="Comment" />
            <IconLabel icon={Share2} label="Share" />
          </>
        )}
      </div>
    </div>
  );
}

function IconLabel({ icon: Icon, label }: { icon: typeof ThumbsUp; label?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}
