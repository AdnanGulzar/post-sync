import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, ConnectedAccount, Post, SocialPlatform } from '@syncpost/api-client';
import { ALL_PLATFORMS as PLATFORMS } from '@syncpost/platform-core';
import { Badge, Button, Card, CardContent, Checkbox, Skeleton, Textarea, toast } from '@syncpost/ui';
import { api } from '../lib/api';
import { DateTimePicker } from './DateTimePicker';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  PUBLISHED: 'success',
  FAILED: 'destructive',
  PARTIAL: 'warning',
  PUBLISHING: 'info',
  SCHEDULED: 'info',
  DRAFT: 'secondary',
};


const DESTINATION_LABEL: Record<string, string> = {
  PERSONAL: 'Personal',
  PAGE: 'Page',
  GROUP: 'Group',
};

// Earliest moment the calendar/time picker allows scheduling for.
function minScheduleDate(): Date {
  return new Date(Date.now() + 60_000);
}

interface PostsListProps {
  posts: Post[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  /** Connected destinations, needed to publish a draft (pick where it goes). */
  accounts: ConnectedAccount[];
  /** Show only the first N posts (e.g. the Dashboard's "recent" preview). Omit for the full list. */
  limit?: number;
}

export function PostsList({ posts, loading, onChanged, accounts, limit }: PostsListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [postNotices, setPostNotices] = useState<Record<string, string[]>>({});

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishSelected, setPublishSelected] = useState<string[]>([]);
  const [publishSchedule, setPublishSchedule] = useState(false);
  const [publishScheduledAt, setPublishScheduledAt] = useState<Date | undefined>(undefined);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const visible = limit ? posts.slice(0, limit) : posts;

  async function removePost(id: string, isScheduled: boolean, isDraft: boolean) {
    setRemovingId(id);
    try {
      const res = await api.delete<{ id: string; warnings?: string[] }>(`/posts/${id}`);
      await onChanged();
      const warnings = res.warnings;
      if (warnings && warnings.length > 0) {
        setPostNotices((cur) => ({ ...cur, [id]: warnings }));
        toast.warning(isScheduled ? 'Cancelled, with some issues.' : 'Deleted, with some issues.', {
          description: warnings.join(' '),
        });
      } else {
        toast.success(isDraft ? 'Draft deleted.' : isScheduled ? 'Scheduled post cancelled.' : 'Post deleted.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not ${isScheduled ? 'cancel' : 'delete'} this post`);
    } finally {
      setRemovingId(null);
    }
  }

  function startEdit(post: Post) {
    setEditingId(post.id);
    setEditDraft(post.content);
    setPostNotices((cur) => ({ ...cur, [post.id]: [] }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function saveEdit(id: string) {
    if (!editDraft.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api.patch<{
        post: Post;
        editOutcomes: { platform: SocialPlatform; destinationLabel?: string | null; ok: boolean; message?: string }[];
      }>(`/posts/${id}`, { content: editDraft });
      await onChanged();
      const failures = res.editOutcomes.filter((o) => !o.ok).map((o) => `${o.destinationLabel || o.platform}: ${o.message}`);
      setPostNotices((cur) => ({ ...cur, [id]: failures }));
      setEditingId(null);
      setEditDraft('');
      if (failures.length > 0) {
        toast.warning('Updated, but not everywhere.', { description: failures.join(' ') });
      } else {
        toast.success('Post updated.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not edit this post');
    } finally {
      setSavingEdit(false);
    }
  }

  function startPublish(post: Post) {
    setPublishingId(post.id);
    setPublishSelected(post.destinationIds);
    setPublishSchedule(false);
    setPublishScheduledAt(undefined);
    setPublishError(null);
  }

  function cancelPublish() {
    setPublishingId(null);
    setPublishSelected([]);
  }

  function togglePublishDestination(id: string) {
    setPublishSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submitPublish(id: string) {
    setPublishError(null);
    if (publishSelected.length === 0) {
      setPublishError('Pick at least one destination.');
      return;
    }
    if (publishSchedule && !publishScheduledAt) {
      setPublishError('Pick a date and time to schedule this post for.');
      return;
    }
    setPublishSubmitting(true);
    try {
      await api.post(`/posts/${id}/publish`, {
        destinationIds: publishSelected,
        scheduledAt: publishSchedule && publishScheduledAt ? publishScheduledAt.toISOString() : undefined,
      });
      await onChanged();
      setPublishingId(null);
      setPublishSelected([]);
      toast.success(publishSchedule ? 'Post scheduled.' : 'Post published.');
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Could not publish this draft');
    } finally {
      setPublishSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.min(limit ?? 3, 3) }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((post) => {
        const isDraft = post.status === 'DRAFT';
        const isScheduled = post.status === 'SCHEDULED';
        const isEditable = isDraft || isScheduled || post.status === 'PUBLISHED' || post.status === 'PARTIAL';
        const isRemovable =
          isDraft || isScheduled || post.status === 'PUBLISHED' || post.status === 'PARTIAL' || post.status === 'FAILED';
        const isEditing = editingId === post.id;
        const isPublishing = publishingId === post.id;
        const notices = postNotices[post.id];

        return (
          <Card key={post.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-2 p-4">
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea rows={4} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={savingEdit} onClick={() => saveEdit(post.id)}>
                      {savingEdit ? 'Saving...' : 'Save'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={savingEdit} onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : isDraft ? (
                <p className="line-clamp-4 text-sm">{post.content}</p>
              ) : (
                <Link to={`/posts/${post.id}`} className="line-clamp-4 text-sm hover:underline">
                  {post.content}
                </Link>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[post.status] ?? 'secondary'}>{post.status}</Badge>
                {isScheduled && post.scheduledAt && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.scheduledAt).toLocaleString()}
                  </span>
                )}
              </div>

              {notices && notices.length > 0 && (
                <ul className="space-y-0.5 text-xs text-warning-fg">
                  {notices.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}

              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {post.results.map((r) => (
                  <li key={r.id} className="truncate">
                    {r.destinationLabel || r.platform}: {r.status} {r.error ? `— ${r.error}` : ''}
                  </li>
                ))}
              </ul>

              {isPublishing && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-2">
                    {PLATFORMS.map((p) => {
                      const destinations = accounts.filter((a) => a.platform === p.id);
                      if (destinations.length === 0) return null;
                      return (
                        <div key={p.id}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{p.label}</p>
                          <div className="flex flex-wrap gap-3">
                            {destinations.map((d) => (
                              <label key={d.id} className="flex items-center gap-1.5 text-xs">
                                <Checkbox
                                  checked={publishSelected.includes(d.id)}
                                  onCheckedChange={() => togglePublishDestination(d.id)}
                                />
                                {d.platformUsername || d.platform}
                                <Badge variant="secondary">{DESTINATION_LABEL[d.destinationType] || d.destinationType}</Badge>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {accounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">Connect a platform first to publish this.</p>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={publishSchedule} onCheckedChange={() => setPublishSchedule((v) => !v)} />
                    Schedule for later
                  </label>
                  {publishSchedule && (
                    <DateTimePicker value={publishScheduledAt} onChange={setPublishScheduledAt} minDate={minScheduleDate()} />
                  )}

                  {publishError && <p className="text-xs text-destructive">{publishError}</p>}

                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={publishSubmitting} onClick={() => submitPublish(post.id)}>
                      {publishSubmitting ? 'Working...' : publishSchedule ? 'Schedule' : 'Publish now'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={publishSubmitting} onClick={cancelPublish}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {!isEditing && !isPublishing && (isEditable || isRemovable || isDraft) && (
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {isDraft && (
                    <Button type="button" size="sm" onClick={() => startPublish(post)}>
                      Publish
                    </Button>
                  )}
                  {isEditable && (
                    <Button type="button" variant="outline" size="sm" onClick={() => startEdit(post)}>
                      Edit
                    </Button>
                  )}
                  {isRemovable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={removingId === post.id}
                      onClick={() => removePost(post.id, isScheduled, isDraft)}
                    >
                      {removingId === post.id ? '...' : isDraft ? 'Delete' : isScheduled ? 'Cancel' : 'Delete'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
