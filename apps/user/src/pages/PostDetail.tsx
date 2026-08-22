import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, Post } from '@syncpost/api-client';
import { PLATFORMS } from '@syncpost/platform-core';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@syncpost/ui';
import { api } from '../lib/api';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info'> = {
  PUBLISHED: 'success',
  FAILED: 'destructive',
  PARTIAL: 'warning',
  PUBLISHING: 'info',
  SCHEDULED: 'info',
  SUCCESS: 'success',
  PENDING: 'info',
};

// Best-effort public permalink so "View on <platform>" has somewhere useful to go.

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get<Post>(`/posts/${id}`)
      .then(setPost)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this post'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="space-y-4">
        <Link to="/posts" className="mb-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
          ← Back to posts
        </Link>
        <p className="text-sm text-destructive">{error || 'Post not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/posts" className="mb-4 inline-block text-sm font-medium underline-offset-4 hover:underline">
        ← Back to posts
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Post</CardTitle>
            <Badge variant={STATUS_VARIANT[post.status] ?? 'secondary'}>{post.status}</Badge>
            {post.scheduledAt && (
              <span className="text-xs text-muted-foreground">
                Scheduled for {new Date(post.scheduledAt).toLocaleString()}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Created {new Date(post.createdAt).toLocaleString()}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{post.content}</p>
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" className="max-h-96 rounded-md border object-cover" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-destination results</CardTitle>
        </CardHeader>
        <CardContent>
          {post.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No destinations yet.</p>
          ) : (
            <ul className="divide-y">
              {post.results.map((r) => {
                const permalink = r.platformPostId ? PLATFORMS[r.platform].permalink(r.platformPostId) : null;
                return (
                  <li key={r.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.destinationLabel || r.platform}</span>
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{r.status}</Badge>
                      {permalink && (
                        <a
                          href={permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium underline-offset-4 hover:underline"
                        >
                          View on {r.platform === 'X' ? 'X' : r.platform === 'FACEBOOK' ? 'Facebook' : 'LinkedIn'}
                        </a>
                      )}
                    </div>
                    {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                    {r.metrics && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground">{r.metrics.likes ?? 0}</span> likes
                        </span>
                        <span>
                          <span className="font-medium text-foreground">{r.metrics.comments ?? 0}</span> comments
                        </span>
                        {r.metrics.shares != null && (
                          <span>
                            <span className="font-medium text-foreground">{r.metrics.shares}</span> shares
                          </span>
                        )}
                        {r.metrics.impressions != null && (
                          <span>
                            <span className="font-medium text-foreground">{r.metrics.impressions}</span> impressions
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
