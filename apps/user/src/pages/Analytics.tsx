import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlatformAnalytics, PostAnalytics } from '@syncpost/api-client';
import { PLATFORMS } from '@syncpost/platform-core';
import { Button, Card, CardContent, CardHeader, CardTitle, HorizontalBarChart, Skeleton, cn } from '@syncpost/ui';
import { api } from '../lib/api';


type DateRange = { from: Date | null; to: Date | null };
type PresetKey = 'today' | '7d' | '30d' | 'all' | 'custom';

const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All time' },
];

function rangeForPreset(key: Exclude<PresetKey, 'custom'>): DateRange {
  const today = new Date();
  if (key === 'all') return { from: null, to: null };
  if (key === 'today') return { from: today, to: today };
  const from = new Date(today);
  from.setDate(from.getDate() - (key === '7d' ? 6 : 29));
  return { from, to: today };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// <input type="date"> needs a local (not UTC) yyyy-mm-dd — toISOString() would
// shift the date across midnight for anyone not at UTC+0.
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a native `<input type="date">` value ("YYYY-MM-DD") as a local-time Date.
 *
 * @param v - The raw input value. May be partial or malformed while the user types.
 * @returns The parsed date, or `null` when the value isn't a complete date — the
 *          range state already treats `null` as "no bound", so a half-typed date
 *          no longer produces an Invalid Date that silently breaks the query.
 */
function fromDateInputValue(v: string): Date | null {
  const [y, m, d] = v.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return null;
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return new Date(y, m - 1, d);
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

function StatusMix({ combined }: { combined: PostAnalytics['combined'] }) {
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

function PlatformSection({ stats, max }: { stats: PlatformAnalytics; max: number }) {
  const outcomeData = [
    { key: 'success', label: 'Published', value: stats.success, className: 'bg-success-fg' },
    { key: 'failed', label: 'Failed', value: stats.failed, className: 'bg-destructive-fg' },
    ...(stats.pending > 0
      ? [{ key: 'pending', label: 'Pending', value: stats.pending, className: 'bg-muted-foreground' }]
      : []),
  ];

  const engagementData = [
    { key: 'likes', label: 'Likes', value: stats.totals.likes },
    { key: 'comments', label: 'Comments', value: stats.totals.comments },
    { key: 'shares', label: 'Shares', value: stats.totals.shares },
    ...(stats.totals.impressions > 0 ? [{ key: 'impressions', label: 'Impressions', value: stats.totals.impressions }] : []),
  ];
  const hasEngagement = engagementData.some((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', PLATFORMS[stats.platform].colorToken)} />
          {PLATFORMS[stats.platform].label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Publishing outcomes</p>
          <HorizontalBarChart data={outcomeData} max={max} labelWidthClassName="w-16" />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Engagement</p>
          {hasEngagement ? (
            <HorizontalBarChart data={engagementData} barClassName={PLATFORMS[stats.platform].colorToken} labelWidthClassName="w-20" />
          ) : (
            <p className="text-sm text-muted-foreground">No engagement data yet.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Recent posts</p>
          {stats.recentPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing published here yet.</p>
          ) : (
            <ul className="divide-y">
              {stats.recentPosts.slice(0, 5).map((p) => (
                <li key={`${p.postId}-${p.destinationLabel}`}>
                  <Link
                    to={`/posts/${p.postId}`}
                    className="block py-2 text-sm transition-colors hover:text-foreground"
                  >
                    <p className="truncate text-foreground">{p.content}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {p.destinationLabel && <span>{p.destinationLabel}</span>}
                      {p.metrics && (
                        <>
                          <span>{p.metrics.likes ?? 0} likes</span>
                          <span>{p.metrics.comments ?? 0} comments</span>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const [data, setData] = useState<PostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [presetKey, setPresetKey] = useState<PresetKey>('today');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('today'));

  function applyPreset(key: Exclude<PresetKey, 'custom'>) {
    setPresetKey(key);
    setRange(rangeForPreset(key));
  }

  function setCustomFrom(value: string) {
    setPresetKey('custom');
    setRange((r) => ({ ...r, from: value ? fromDateInputValue(value) : null }));
  }

  function setCustomTo(value: string) {
    setPresetKey('custom');
    setRange((r) => ({ ...r, to: value ? fromDateInputValue(value) : null }));
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (range.from) params.set('from', startOfDay(range.from).toISOString());
    if (range.to) params.set('to', endOfDay(range.to).toISOString());
    const qs = params.toString();
    api
      .get<PostAnalytics>(`/posts/analytics${qs ? `?${qs}` : ''}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  const { combined, platforms } = data ?? { combined: { published: 0, failed: 0, partial: 0, scheduled: 0, total: 0 }, platforms: [] };
  const maxAttempts = Math.max(1, ...platforms.map((p) => p.success + p.failed + p.pending));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Combined across all platforms, and broken out separately per platform — engagement numbers are fetched
          live from each connected account.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={presetKey === p.key ? 'default' : 'outline'}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
        <span className={cn('mx-1 h-5 w-px bg-border', 'hidden sm:inline-block')} />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="date"
            value={range.from ? toDateInputValue(range.from) : ''}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          <span>to</span>
          <input
            type="date"
            value={range.to ? toDateInputValue(range.to) : ''}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="space-y-2 p-5">
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-24" />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : combined.total === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No posts in this range — try a wider date range, or publish something.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
            <div className="grid grid-cols-2 gap-4">
              <StatTile label="Published" value={combined.published} tone="success" />
              <StatTile label="Failed" value={combined.failed} tone="destructive" />
              <StatTile label="Partial" value={combined.partial} tone="warning" />
              <StatTile label="Scheduled" value={combined.scheduled} tone="info" />
            </div>
            <StatusMix combined={combined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {platforms.map((stats) => (
              <PlatformSection key={stats.platform} stats={stats} max={maxAttempts} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
