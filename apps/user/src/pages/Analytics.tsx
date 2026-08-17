import { useEffect, useMemo, useState } from 'react';
import { Post, SocialPlatform } from '@syncpost/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@syncpost/ui';
import { api } from '../lib/api';

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  LINKEDIN: 'LinkedIn',
  FACEBOOK: 'Facebook',
  X: 'X (Twitter)',
};
const PLATFORMS: SocialPlatform[] = ['LINKEDIN', 'FACEBOOK', 'X'];

interface CombinedStats {
  published: number;
  failed: number;
  partial: number;
  scheduled: number;
  total: number;
}

interface PlatformStats {
  platform: SocialPlatform;
  success: number;
  failed: number;
  pending: number;
  attempts: number;
}

function computeCombined(posts: Post[]): CombinedStats {
  return {
    published: posts.filter((p) => p.status === 'PUBLISHED').length,
    failed: posts.filter((p) => p.status === 'FAILED').length,
    partial: posts.filter((p) => p.status === 'PARTIAL').length,
    scheduled: posts.filter((p) => p.status === 'SCHEDULED').length,
    total: posts.length,
  };
}

function computePerPlatform(posts: Post[]): PlatformStats[] {
  return PLATFORMS.map((platform) => {
    const results = posts.flatMap((p) => p.results.filter((r) => r.platform === platform));
    const success = results.filter((r) => r.status === 'SUCCESS').length;
    const failed = results.filter((r) => r.status === 'FAILED').length;
    const pending = results.filter((r) => r.status === 'PENDING').length;
    return { platform, success, failed, pending, attempts: success + failed + pending };
  });
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'destructive' | 'warning' | 'info';
}) {
  const toneClasses = {
    success: 'bg-success-bg text-success-fg',
    destructive: 'bg-destructive-bg text-destructive-fg',
    warning: 'bg-warning-bg text-warning-fg',
    info: 'bg-info-bg text-info-fg',
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses}`}>
          {label}
        </span>
      </CardContent>
    </Card>
  );
}

function PlatformBar({ stats, max }: { stats: PlatformStats; max: number }) {
  const successPct = max > 0 ? (stats.success / max) * 100 : 0;
  const failedPct = max > 0 ? (stats.failed / max) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-sm font-medium">{PLATFORM_LABELS[stats.platform]}</span>
      <div className="flex h-4 flex-1 items-center gap-0.5">
        {stats.attempts === 0 ? (
          <div className="h-full w-full rounded-sm bg-muted" />
        ) : (
          <>
            {stats.success > 0 && (
              <div
                className="h-full min-w-[2px] rounded-sm bg-success-fg"
                style={{ width: `${successPct}%` }}
                title={`${stats.success} published successfully on ${PLATFORM_LABELS[stats.platform]}`}
              />
            )}
            {stats.failed > 0 && (
              <div
                className="h-full min-w-[2px] rounded-sm bg-destructive-fg"
                style={{ width: `${failedPct}%` }}
                title={`${stats.failed} failed on ${PLATFORM_LABELS[stats.platform]}`}
              />
            )}
          </>
        )}
      </div>
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
        <span className="font-medium text-success-fg">{stats.success}</span>
        {' / '}
        <span className="font-medium text-destructive-fg">{stats.failed}</span>
        {stats.pending > 0 && <span> ({stats.pending} pending)</span>}
      </span>
    </div>
  );
}

export default function Analytics() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Post[]>('/posts')
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  const combined = useMemo(() => computeCombined(posts), [posts]);
  const perPlatform = useMemo(() => computePerPlatform(posts), [posts]);
  const maxAttempts = Math.max(1, ...perPlatform.map((p) => p.success + p.failed));

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading analytics...</p>;
  }

  if (combined.total === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No posts yet — analytics will show up here once you publish something.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1">Analytics</h1>
        <p className="text-sm text-muted-foreground">Combined across all platforms, and broken out by platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Published" value={combined.published} tone="success" />
        <StatTile label="Failed" value={combined.failed} tone="destructive" />
        <StatTile label="Partial" value={combined.partial} tone="warning" />
        <StatTile label="Scheduled" value={combined.scheduled} tone="info" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publishing outcomes by platform</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-success-fg" /> Published
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-destructive-fg" /> Failed
            </span>
          </div>
          <div className="space-y-4">
            {perPlatform.map((stats) => (
              <PlatformBar key={stats.platform} stats={stats} max={maxAttempts} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
