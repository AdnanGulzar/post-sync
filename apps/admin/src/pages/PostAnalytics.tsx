import { useEffect, useState } from 'react';
import { AdminPostAnalytics, SocialPlatform } from '@syncpost/api-client';
import { PLATFORMS } from '@syncpost/platform-core';
import { Card, CardContent, CardHeader, CardTitle, HorizontalBarChart, Skeleton, cn } from '@syncpost/ui';
import { api } from '../lib/api';


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

function StatusMix({ combined }: { combined: AdminPostAnalytics['combined'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status mix</CardTitle>
      </CardHeader>
      <CardContent>
        <HorizontalBarChart
          data={[
            { key: 'published', label: 'Published', value: combined.published, className: 'bg-success-fg' },
            { key: 'partial', label: 'Partial', value: combined.partial, className: 'bg-warning-fg' },
            { key: 'scheduled', label: 'Scheduled', value: combined.scheduled, className: 'bg-info-fg' },
            { key: 'failed', label: 'Failed', value: combined.failed, className: 'bg-destructive-fg' },
          ]}
          max={combined.total}
          labelWidthClassName="w-20"
        />
      </CardContent>
    </Card>
  );
}

export default function PostAnalytics() {
  const [data, setData] = useState<AdminPostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminPostAnalytics>('/admin/analytics/posts')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-full min-h-[7rem] w-full" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-destructive">Could not load post analytics.</p>;
  }

  const { combined, platforms, topPosters } = data;
  const maxAttempts = Math.max(1, ...platforms.map((p) => p.success + p.failed + p.pending));
  const maxPosts = Math.max(1, ...topPosters.map((u) => u.postCount));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1">Post analytics</h1>
        <p className="text-sm text-muted-foreground">Publishing activity across every user, platform by platform.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Published" value={combined.published} tone="success" />
          <StatTile label="Failed" value={combined.failed} tone="destructive" />
          <StatTile label="Partial" value={combined.partial} tone="warning" />
          <StatTile label="Scheduled" value={combined.scheduled} tone="info" />
        </div>
        <StatusMix combined={combined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publishing outcomes by platform</CardTitle>
        </CardHeader>
        <CardContent>
          {combined.total === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet across any account.</p>
          ) : (
            <div className="space-y-5">
              {platforms.map((stats) => (
                <div key={stats.platform}>
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', PLATFORMS[stats.platform].colorToken)} />
                    {PLATFORMS[stats.platform].label}
                  </p>
                  <HorizontalBarChart
                    data={[
                      { key: 'success', label: 'Published', value: stats.success, className: 'bg-success-fg' },
                      { key: 'failed', label: 'Failed', value: stats.failed, className: 'bg-destructive-fg' },
                      ...(stats.pending > 0
                        ? [{ key: 'pending', label: 'Pending', value: stats.pending, className: 'bg-muted-foreground' }]
                        : []),
                    ]}
                    max={maxAttempts}
                    labelWidthClassName="w-16"
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most active users</CardTitle>
        </CardHeader>
        <CardContent>
          {topPosters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet.</p>
          ) : (
            <HorizontalBarChart
              data={topPosters.map((u) => ({
                key: u.userId,
                label: u.name,
                value: u.postCount,
              }))}
              max={maxPosts}
              labelWidthClassName="w-32"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
