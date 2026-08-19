import { FormEvent, useEffect, useState } from 'react';
import { AdminUser, ApiError, Plan, SubscriptionStatus } from '@syncpost/api-client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

const STATUSES: SubscriptionStatus[] = ['ACTIVE', 'INACTIVE', 'EXPIRED'];

function GrantSubscriptionForm({
  userItem,
  plans,
  onUpdated,
}: {
  userItem: AdminUser;
  plans: Plan[];
  onUpdated: () => void;
}) {
  const currentPlanId = userItem.subscription?.planId || plans[0]?.id || '';
  const [planId, setPlanId] = useState(currentPlanId);
  const [status, setStatus] = useState<SubscriptionStatus>(userItem.subscription?.status || 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [planId, status]);

  // A plan currently assigned to a user but since disabled still needs to show up in the picker.
  const selectablePlans =
    userItem.subscription && !plans.some((p) => p.id === currentPlanId)
      ? [...plans, userItem.subscription.plan]
      : plans;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/users/${userItem.id}/subscription`, { planId, status });
      onUpdated();
      toast.success(`Subscription updated for ${userItem.name}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not update subscription';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={planId} onValueChange={setPlanId}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectablePlans.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {!p.isActive ? ' (disabled)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={(v) => setStatus(v as SubscriptionStatus)}>
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setCreateError(null);
  }, [name, email, password]);

  async function load() {
    setLoading(true);
    const [usersData, plansData] = await Promise.all([
      api.get<AdminUser[]>('/admin/users'),
      api.get<Plan[]>('/admin/plans'),
    ]);
    setUsers(usersData);
    setPlans(plansData.filter((p) => p.isActive));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post('/admin/users', { name, email, password });
      setName('');
      setEmail('');
      setPassword('');
      setShowCreate(false);
      await load();
      toast.success(`${name} was created.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create user';
      setCreateError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    try {
      await api.patch(`/admin/users/${u.id}/${u.isActive ? 'deactivate' : 'reactivate'}`);
      await load();
      toast.success(`${u.name} ${u.isActive ? 'deactivated' : 'reactivated'}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update this user');
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">Users</CardTitle>
        <Button variant={showCreate ? 'outline' : 'default'} onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Cancel' : '+ Create user'}
        </Button>
      </CardHeader>
      <CardContent>
        {showCreate && (
          <form
            onSubmit={onCreate}
            className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted p-4"
          >
            <Input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-40"
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-48"
            />
            <Input
              type="password"
              placeholder="Temporary password (min 8 chars)"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-56"
            />
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create with default active plan'}
            </Button>
            {createError && <p className="w-full text-sm text-destructive">{createError}</p>}
          </form>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead>Subscription access</TableHead>
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
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-64" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive(u)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                        u.isActive ? 'bg-success-bg text-success-fg' : 'bg-secondary text-secondary-foreground',
                      )}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.socialAccounts.map((a) => a.platform).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    <GrantSubscriptionForm userItem={u} plans={plans} onUpdated={load} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
