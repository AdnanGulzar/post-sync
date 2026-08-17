import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiError, ConnectedAccount, Post, SocialPlatform } from '@syncpost/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@syncpost/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PostEditor, PostBlock, blocksToContent, firstImageUrl, imageCount } from '../components/PostEditor';
import { RichPostEditor } from '../components/RichPostEditor';
import { CharacterCount, PlatformPreview } from '../components/PlatformPreview';
import { adaptForPlatforms, wasAdapted } from '../lib/platformAdapt';

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: 'LINKEDIN', label: 'LinkedIn' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'X', label: 'X (Twitter)' },
];

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info'> = {
  PUBLISHED: 'success',
  FAILED: 'destructive',
  PARTIAL: 'warning',
  PUBLISHING: 'info',
  SCHEDULED: 'info',
};

// min attribute for the datetime-local input — one minute from now, in local time.
function minScheduleValue(): string {
  const d = new Date(Date.now() + 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function newBlock(): PostBlock {
  return { id: crypto.randomUUID(), type: 'text', text: '' };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'sections' | 'rich'>('sections');

  // Sections mode draft
  const [blocks, setBlocks] = useState<PostBlock[]>([newBlock()]);
  // Rich text mode draft — kept independently so switching tabs never loses work
  const [richText, setRichText] = useState('');
  const [richImageUrl, setRichImageUrl] = useState('');

  const [selected, setSelected] = useState<SocialPlatform[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [postNotices, setPostNotices] = useState<Record<string, string[]>>({});
  const [loadingPosts, setLoadingPosts] = useState(true);

  const sectionsContent = useMemo(() => blocksToContent(blocks), [blocks]);
  const sectionsImageUrl = useMemo(() => firstImageUrl(blocks), [blocks]);
  const extraImages = Math.max(0, imageCount(blocks) - 1);

  const content = mode === 'sections' ? sectionsContent : richText;
  const imageUrl = mode === 'sections' ? sectionsImageUrl : richImageUrl.trim() || undefined;

  const previewPlatforms = selected.length > 0 ? selected : PLATFORMS.map((p) => p.key);
  // Auto-adapt (no AI): each platform gets its own version of the content, shortened
  // to fit that platform's real character limit if the draft is too long. Platforms
  // that don't need shortening just get the content unchanged.
  const platformContent = useMemo(() => adaptForPlatforms(content, previewPlatforms), [content, previewPlatforms]);

  async function loadAll() {
    const [accs, myPosts] = await Promise.all([
      api.get<ConnectedAccount[]>('/social/accounts'),
      api.get<Post[]>('/posts'),
    ]);
    setAccounts(accs);
    setPosts(myPosts);
  }

  useEffect(() => {
    loadAll().finally(() => setLoadingPosts(false));
  }, []);

  function togglePlatform(p: SocialPlatform) {
    setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) {
      setError('Pick at least one connected platform to post to.');
      return;
    }
    if (!content.trim()) {
      setError(mode === 'sections' ? 'Add at least one text section before publishing.' : 'Write something before publishing.');
      return;
    }
    if (schedule && !scheduledAt) {
      setError('Pick a date and time to schedule this post for.');
      return;
    }
    setSubmitting(true);
    try {
      const scheduledAtIso = schedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const platformContentForSelected = Object.fromEntries(
        selected.map((p) => [p, platformContent[p]]).filter(([, v]) => v !== undefined),
      );
      await api.post('/posts', {
        content,
        imageUrl,
        platforms: selected,
        platformContent: platformContentForSelected,
        scheduledAt: scheduledAtIso,
      });
      setBlocks([newBlock()]);
      setRichText('');
      setRichImageUrl('');
      setSelected([]);
      setSchedule(false);
      setScheduledAt('');
      await loadAll();
      toast.success(schedule ? 'Post scheduled.' : 'Post published.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not publish this post';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function removePost(id: string, isScheduled: boolean) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await api.delete<{ id: string; warnings?: string[] }>(`/posts/${id}`);
      await loadAll();
      const warnings = res.warnings;
      if (warnings && warnings.length > 0) {
        setPostNotices((cur) => ({ ...cur, [id]: warnings }));
        toast.warning(isScheduled ? 'Cancelled, with some issues.' : 'Deleted, with some issues.', {
          description: warnings.join(' '),
        });
      } else {
        toast.success(isScheduled ? 'Scheduled post cancelled.' : 'Post deleted.');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : `Could not ${isScheduled ? 'cancel' : 'delete'} this post`;
      setError(message);
      toast.error(message);
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
    setError(null);
    try {
      const res = await api.patch<{ post: Post; editOutcomes: { platform: SocialPlatform; ok: boolean; message?: string }[] }>(
        `/posts/${id}`,
        { content: editDraft },
      );
      await loadAll();
      const failures = res.editOutcomes.filter((o) => !o.ok).map((o) => `${o.platform}: ${o.message}`);
      setPostNotices((cur) => ({ ...cur, [id]: failures }));
      setEditingId(null);
      setEditDraft('');
      if (failures.length > 0) {
        toast.warning('Updated, but not everywhere.', { description: failures.join(' ') });
      } else {
        toast.success('Post updated.');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not edit this post';
      setError(message);
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  }

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create a post</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'sections' | 'rich')}>
                <TabsList>
                  <TabsTrigger value="sections">Sections</TabsTrigger>
                  <TabsTrigger value="rich">Rich text</TabsTrigger>
                </TabsList>
                <TabsContent value="sections">
                  <PostEditor blocks={blocks} onChange={setBlocks} />
                  {extraImages > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Only the first image is published to each platform right now — {extraImages} extra image
                      {extraImages > 1 ? 's' : ''} will be kept in your draft but not sent.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="rich">
                  <RichPostEditor
                    text={richText}
                    onTextChange={setRichText}
                    imageUrl={richImageUrl}
                    onImageChange={setRichImageUrl}
                  />
                </TabsContent>
              </Tabs>

              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Publish to</p>
                <div className="flex flex-wrap gap-5">
                  {PLATFORMS.map((p) => {
                    const isConnected = connectedPlatforms.has(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`flex items-center gap-2 text-sm ${isConnected ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        <Checkbox
                          disabled={!isConnected}
                          checked={selected.includes(p.key)}
                          onCheckedChange={() => togglePlatform(p.key)}
                        />
                        {p.label} {!isConnected && '(not connected)'}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={schedule} onCheckedChange={() => setSchedule((v) => !v)} />
                  Schedule for later
                </label>
                {schedule && (
                  <Input
                    type="datetime-local"
                    min={minScheduleValue()}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="max-w-xs"
                  />
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? (schedule ? 'Scheduling...' : 'Publishing...') : schedule ? 'Schedule post' : 'Publish now'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={previewPlatforms[0]}>
              <TabsList>
                {previewPlatforms.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {PLATFORMS.find((p) => p.key === key)?.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {previewPlatforms.map((key) => {
                const account = accounts.find((a) => a.platform === key);
                const adapted = platformContent[key] ?? content;
                return (
                  <TabsContent key={key} value={key} className="space-y-2">
                    <PlatformPreview
                      platform={key}
                      authorName={account?.platformUsername || user?.name || 'You'}
                      handle={account?.platformUsername}
                      content={adapted}
                      imageUrl={imageUrl}
                    />
                    <CharacterCount platform={key} content={adapted} />
                    {wasAdapted(content, key) && (
                      <p className="text-xs text-info-fg">
                        Shortened to fit {PLATFORMS.find((p) => p.key === key)?.label}'s character limit — this is
                        what will actually be published there.
                      </p>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your posts</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPosts ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {posts.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
              <ul className="divide-y">
                {posts.map((post) => {
              const isScheduled = post.status === 'SCHEDULED';
              const isEditable = isScheduled || post.status === 'PUBLISHED' || post.status === 'PARTIAL';
              const isRemovable = isScheduled || post.status === 'PUBLISHED' || post.status === 'PARTIAL' || post.status === 'FAILED';
              const isEditing = editingId === post.id;
              const notices = postNotices[post.id];

              return (
                <li key={post.id} className="py-3 first:pt-0 last:pb-0">
                  {isEditing ? (
                    <div className="mb-1.5 space-y-2">
                      <Textarea rows={3} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={savingEdit} onClick={() => saveEdit(post.id)}>
                          {savingEdit ? 'Saving...' : 'Save'}
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={savingEdit} onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mb-1.5 text-sm">{post.content}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[post.status] ?? 'secondary'}>{post.status}</Badge>
                    {isScheduled && post.scheduledAt && (
                      <span className="text-xs text-muted-foreground">
                        Scheduled for {new Date(post.scheduledAt).toLocaleString()}
                      </span>
                    )}
                    {!isEditing && isEditable && (
                      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(post)}>
                        Edit
                      </Button>
                    )}
                    {!isEditing && isRemovable && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removingId === post.id}
                        onClick={() => removePost(post.id, isScheduled)}
                      >
                        {removingId === post.id ? '...' : isScheduled ? 'Cancel' : 'Delete'}
                      </Button>
                    )}
                  </div>

                  {notices && notices.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-warning-fg">
                      {notices.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}

                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {post.results.map((r) => (
                      <li key={r.id}>
                        {r.platform}: {r.status} {r.error ? `— ${r.error}` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
