import { FormEvent, useEffect, useState } from 'react';
import { ApiError, Plan, SocialPlatform } from '@syncpost/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from '@syncpost/ui';
import { api } from '../lib/api';
import { LimitInput } from '../components/LimitInput';
import { PlatformMultiSelect } from '../components/PlatformMultiSelect';

function EditPlanRow({ plan, onUpdated }: { plan: Plan; onUpdated: () => void }) {
  const [price, setPrice] = useState(plan.price);
  const [postsLimit, setPostsLimit] = useState<number | null>(plan.postsLimit);
  const [connectedAccountsLimit, setConnectedAccountsLimit] = useState<number | null>(plan.connectedAccountsLimit);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(plan.platforms);
  const [stripePriceId, setStripePriceId] = useState(plan.stripePriceId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the admin touches any field again after a failed save, drop the stale error
  // instead of leaving it hanging around after they've already fixed things.
  useEffect(() => {
    setError(null);
  }, [price, postsLimit, connectedAccountsLimit, platforms, stripePriceId]);

  async function save() {
    if (platforms.length === 0) {
      setError('Pick at least one platform.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/plans/${plan.id}`, {
        price,
        postsLimit,
        connectedAccountsLimit,
        platforms,
        stripePriceId: stripePriceId || null,
      });
      onUpdated();
      toast.success(`"${plan.name}" updated.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update plan';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/plans/${plan.id}`, { isActive: !plan.isActive });
      onUpdated();
      toast.success(`"${plan.name}" ${plan.isActive ? 'disabled' : 'enabled'}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update plan';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!confirm(`Delete the "${plan.name}" plan? This only works if no one is currently on it.`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/admin/plans/${plan.id}`);
      onUpdated();
      toast.success(`"${plan.name}" deleted.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete plan';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {plan.name}
        {plan.isCustom && (
          <Badge variant="secondary" className="ml-1.5">
            Custom
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="h-8 w-16 text-xs"
          />
        </div>
      </TableCell>
      <TableCell>
        <LimitInput value={postsLimit} onChange={setPostsLimit} />
      </TableCell>
      <TableCell>
        <PlatformMultiSelect value={platforms} onChange={setPlatforms} />
      </TableCell>
      <TableCell>
        <LimitInput value={connectedAccountsLimit} onChange={setConnectedAccountsLimit} />
      </TableCell>
      <TableCell>
        <Input
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
          placeholder={plan.price === 0 ? 'Not needed' : 'price_...'}
          className="h-8 w-32 text-xs"
        />
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={toggleActive}
          disabled={saving}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            plan.isActive ? 'bg-success-bg text-success-fg' : 'bg-secondary text-secondary-foreground',
          )}
        >
          {plan.isActive ? 'Active' : 'Disabled'}
        </button>
      </TableCell>
      <TableCell>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={removePlan} disabled={saving}>
            Delete
          </Button>
        </div>
        {error && <p className="mt-1 max-w-[12rem] text-xs text-destructive">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [postsLimit, setPostsLimit] = useState<number | null>(null);
  const [connectedAccountsLimit, setConnectedAccountsLimit] = useState<number | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['LINKEDIN', 'FACEBOOK', 'X']);
  const [stripePriceId, setStripePriceId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Same idea as the edit row: once the admin edits the create form again, the
  // previous submit's error is no longer relevant.
  useEffect(() => {
    setCreateError(null);
  }, [name, price, postsLimit, connectedAccountsLimit, platforms, stripePriceId]);

  async function load() {
    setLoading(true);
    const data = await api.get<Plan[]>('/admin/plans');
    setPlans(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (platforms.length === 0) {
      setCreateError('Pick at least one platform.');
      return;
    }
    setCreating(true);
    try {
      await api.post('/admin/plans', {
        name,
        price,
        postsLimit,
        connectedAccountsLimit,
        platforms,
        stripePriceId: stripePriceId || undefined,
      });
      setName('');
      setPrice(0);
      setPostsLimit(null);
      setConnectedAccountsLimit(null);
      setPlatforms(['LINKEDIN', 'FACEBOOK', 'X']);
      setStripePriceId('');
      setShowCreate(false);
      await load();
      toast.success(`"${name}" plan created.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create plan';
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">Subscription plans</CardTitle>
        <Button variant={showCreate ? 'outline' : 'default'} onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Cancel' : '+ Create custom plan'}
        </Button>
      </CardHeader>
      <CardContent>
        {showCreate && (
          <form onSubmit={onCreate} className="mb-4 flex flex-wrap items-end gap-4 rounded-md border bg-muted p-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="w-40" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Price ($/mo)</label>
              <Input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Posts / month</label>
              <LimitInput value={postsLimit} onChange={setPostsLimit} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Allowed platforms</label>
              <PlatformMultiSelect value={platforms} onChange={setPlatforms} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Max connections</label>
              <LimitInput value={connectedAccountsLimit} onChange={setConnectedAccountsLimit} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Stripe price ID</label>
              <Input
                value={stripePriceId}
                onChange={(e) => setStripePriceId(e.target.value)}
                placeholder={price === 0 ? 'Not needed' : 'price_...'}
                className="w-36"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create plan'}
            </Button>
            {createError && <p className="w-full text-sm text-destructive">{createError}</p>}
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Posts / month</TableHead>
              <TableHead>Allowed platforms</TableHead>
              <TableHead>Max connections</TableHead>
              <TableHead>Stripe price ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-16 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-32" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              plans.map((p) => <EditPlanRow key={p.id} plan={p} onUpdated={load} />)
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
