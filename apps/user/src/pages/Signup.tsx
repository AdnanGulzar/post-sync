import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, ThemeToggle, cn } from '@syncpost/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError, Plan } from '@syncpost/api-client';
import { api } from '../lib/api';
import OAuthButtons from '../components/OAuthButtons';

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const isFree = plan.price === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col rounded-md border p-3 text-left transition-colors hover:border-foreground/40',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <span className="text-sm font-semibold">{plan.name}</span>
      <span className="mt-1 text-lg font-semibold tracking-tight">
        {isFree ? 'Free' : `$${plan.price}`}
        {!isFree && <span className="text-xs font-normal text-muted-foreground">/mo</span>}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">
        {plan.postsLimit === null ? 'Unlimited posts' : `${plan.postsLimit} posts/mo`} ·{' '}
        {plan.connectedAccountsLimit === null ? 'Unlimited platforms' : `${plan.connectedAccountsLimit} platforms`}
      </span>
      <span className={cn('mt-2 text-xs font-medium', isFree ? 'text-success-fg' : 'text-muted-foreground')}>
        {isFree ? 'No card required' : 'Card required'}
      </span>
    </button>
  );
}

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    api
      .get<Plan[]>('/plans')
      .then((data) => {
        setPlans(data);
        const free = data.find((p) => p.price === 0);
        setSelectedPlanId(free?.id || data[0]?.id || '');
      })
      .finally(() => setPlansLoading(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedPlanId) {
      setError('Pick a plan to continue.');
      return;
    }
    setSubmitting(true);
    try {
      const checkoutUrl = await signup(email, password, name, selectedPlanId);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4 h-8 w-8" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
            S
          </span>
          <CardTitle>Create your SyncPost account</CardTitle>
        </CardHeader>
        <CardContent>
          <OAuthButtons />
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={onSubmit} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <Label>Choose a plan</Label>
              {plansLoading ? (
                <p className="text-sm text-muted-foreground">Loading plans...</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      selected={plan.id === selectedPlanId}
                      onSelect={() => setSelectedPlanId(plan.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || plansLoading}>
              {submitting
                ? selectedPlan && selectedPlan.price > 0
                  ? 'Redirecting to payment...'
                  : 'Creating account...'
                : selectedPlan && selectedPlan.price > 0
                  ? 'Continue to payment'
                  : 'Sign up'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
