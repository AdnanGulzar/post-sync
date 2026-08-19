import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, ConnectedAccount, Post, SocialPlatform } from '@syncpost/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@syncpost/ui';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { RichTextEditor, RichTextEditorHandle } from '../components/RichTextEditor';
import { CharacterCount, PlatformPreview } from '../components/PlatformPreview';
import { PostsList } from '../components/PostsList';
import { adaptForPlatforms, wasAdapted } from '../lib/platformAdapt';
import { DateTimePicker } from '../components/DateTimePicker';

const RECENT_POSTS_LIMIT = 5;

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: 'LINKEDIN', label: 'LinkedIn' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'X', label: 'X (Twitter)' },
];

const DESTINATION_LABEL: Record<string, string> = {
  PERSONAL: 'Personal',
  PAGE: 'Page',
  GROUP: 'Group',
};

// Earliest moment the calendar/time picker allows scheduling for.
function minScheduleDate(): Date {
  return new Date(Date.now() + 60_000);
}

export default function Dashboard() {
  const { user } = useAuth();
  const editorRef = useRef<RichTextEditorHandle>(null);

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [extraImages, setExtraImages] = useState(0);

  // Selected destination ids (specific connected accounts — a Facebook Page, a
  // LinkedIn Company Page, etc.), not just platforms — a plan can post to some
  // destinations under a platform and not others.
  const [selected, setSelected] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const selectedAccounts = useMemo(
    () => selected.map((id) => accounts.find((a) => a.id === id)).filter((a): a is ConnectedAccount => !!a),
    [selected, accounts],
  );
  const previewPlatforms =
    selectedAccounts.length > 0 ? [...new Set(selectedAccounts.map((a) => a.platform))] : PLATFORMS.map((p) => p.key);
  // Auto-adapt (no AI): each platform gets its own version of the content, shortened
  // to fit that platform's real character limit if the draft is too long. Platforms
  // that don't need shortening just get the content unchanged.
  const platformContent = useMemo(() => adaptForPlatforms(content, previewPlatforms), [content, previewPlatforms]);

  // Once the field that caused a validation/API error changes, drop the stale
  // message instead of leaving it up after the user has already fixed it.
  useEffect(() => {
    setError(null);
  }, [content, selected, schedule, scheduledAt]);

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

  function toggleDestination(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) {
      setError('Pick at least one connected destination to post to.');
      return;
    }
    if (!content.trim()) {
      setError('Write something before publishing.');
      return;
    }
    if (schedule && !scheduledAt) {
      setError('Pick a date and time to schedule this post for.');
      return;
    }
    setSubmitting(true);
    try {
      const scheduledAtIso = schedule && scheduledAt ? scheduledAt.toISOString() : undefined;
      const platformsForSelected = [...new Set(selectedAccounts.map((a) => a.platform))];
      const platformContentForSelected = Object.fromEntries(
        platformsForSelected.map((p) => [p, platformContent[p]]).filter(([, v]) => v !== undefined),
      );
      await api.post('/posts', {
        content,
        imageUrl,
        destinationIds: selected,
        platformContent: platformContentForSelected,
        scheduledAt: scheduledAtIso,
      });
      editorRef.current?.clear();
      setSelected([]);
      setSchedule(false);
      setScheduledAt(undefined);
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

  // Drafts don't need content adapted per platform yet, or even a destination picked —
  // just save what's there so it can be finished and published later from the Posts page.
  async function saveDraft() {
    setError(null);
    if (!content.trim()) {
      setError('Write something before saving a draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const platformsForSelected = [...new Set(selectedAccounts.map((a) => a.platform))];
      const platformContentForSelected = Object.fromEntries(
        platformsForSelected.map((p) => [p, platformContent[p]]).filter(([, v]) => v !== undefined),
      );
      await api.post('/posts', {
        content,
        imageUrl,
        destinationIds: selected,
        platformContent: platformContentForSelected,
        saveAsDraft: true,
      });
      editorRef.current?.clear();
      setSelected([]);
      setSchedule(false);
      setScheduledAt(undefined);
      await loadAll();
      toast.success('Draft saved.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save this draft';
      setError(message);
      toast.error(message);
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create a post</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <RichTextEditor
                ref={editorRef}
                onChange={(nextContent, nextImageUrl, nextImageCount) => {
                  setContent(nextContent);
                  setImageUrl(nextImageUrl);
                  setExtraImages(Math.max(0, nextImageCount - 1));
                }}
              />
              {extraImages > 0 && (
                <p className="text-xs text-muted-foreground">
                  Only the first image is published to each platform right now — {extraImages} extra image
                  {extraImages > 1 ? 's' : ''} will be kept in your draft but not sent.
                </p>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Publish to</p>
                {loadingPosts ? (
                  <div className="space-y-3">
                    {PLATFORMS.map((p) => (
                      <div key={p.key}>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">{p.label}</p>
                        <Skeleton className="h-6 w-40" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {PLATFORMS.map((p) => {
                      const destinations = accounts.filter((a) => a.platform === p.key);
                      return (
                        <div key={p.key}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{p.label}</p>
                          {destinations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Not connected</p>
                          ) : (
                            <div className="flex flex-wrap gap-4">
                              {destinations.map((d) => (
                                <label key={d.id} className="flex items-center gap-2 text-sm">
                                  <Checkbox checked={selected.includes(d.id)} onCheckedChange={() => toggleDestination(d.id)} />
                                  {d.platformUsername || d.platform}
                                  <Badge variant="secondary">{DESTINATION_LABEL[d.destinationType] || d.destinationType}</Badge>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={schedule} onCheckedChange={() => setSchedule((v) => !v)} />
                  Schedule for later
                </label>
                {schedule && (
                  <DateTimePicker value={scheduledAt} onChange={setScheduledAt} minDate={minScheduleDate()} />
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || savingDraft}>
                  {submitting ? (schedule ? 'Scheduling...' : 'Publishing...') : schedule ? 'Schedule post' : 'Publish now'}
                </Button>
                <Button type="button" variant="outline" disabled={submitting || savingDraft} onClick={saveDraft}>
                  {savingDraft ? 'Saving...' : 'Save as draft'}
                </Button>
              </div>
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
                const account = selectedAccounts.find((a) => a.platform === key) ?? accounts.find((a) => a.platform === key);
                const adapted = platformContent[key] ?? content;
                return (
                  <TabsContent key={key} value={key} className="space-y-2">
                    <PlatformPreview
                      platform={key}
                      authorName={account?.platformUsername || user?.name || 'You'}
                      handle={account?.platformUsername ?? undefined}
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent posts</CardTitle>
          <Link to="/posts" className="text-sm font-medium underline-offset-4 hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          <PostsList posts={posts} loading={loadingPosts} onChanged={loadAll} accounts={accounts} limit={RECENT_POSTS_LIMIT} />
        </CardContent>
      </Card>
    </div>
  );
}
