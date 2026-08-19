import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, MySubscription, Plan } from '@syncpost/api-client';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, cn, toast } from '@syncpost/ui';
import { api } from '../lib/api';

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  EXPIRED: 'destructive',
};

function PlanCard({
  plan,
  isCurrent,
  currentStatus,
  switching,
  onSwitch,
}: {
  plan: Plan;
  isCurrent: boolean;
  currentStatus?: string;
  switching: boolean;
  onSwitch: () => void;
}) {
  const isFree = plan.price === 0;
  const needsPayment = isCurrent && currentStatus !== 'ACTIVE';

  return (
    <Card className={cn(isCurrent && 'border-primary ring-1 ring-primary')}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{plan.name}</span>
          {isCurrent && !needsPayment && <Badge variant="secondary">Current plan</Badge>}
        </div>
        <p className="text-2xl font-semibold tracking-tight">
          {isFree ? 'Free' : `$${plan.price}`}
          {!isFree && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {plan.postsLimit === null ? 'Unlimited posts' : `${plan.postsLimit} posts/mo`} ·{' '}
          {plan.connectedAccountsLimit === null ? 'Unlimited platforms' : `${plan.connectedAccountsLimit} platforms`}
        </p>
        <Button
          type="button"
          className="w-full"
          variant={needsPayment ? 'default' : isCurrent ? 'outline' : 'default'}
          disabled={(isCurrent && !needsPayment) || switching}
          onClick={onSwitch}
        >
          {switching
            ? 'Working...'
            : needsPayment
              ? 'Complete payment'
              : isCurrent
                ? 'Current plan'
                : isFree
                  ? 'Switch to this plan'
                  : 'Switch & pay'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const [data, setData] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingPlanId, setSwitchingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    return api
      .get<MySubscription>('/subscriptions/me')
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function switchTo(plan: Plan) {
    setError(null);
    setSwitchingPlanId(plan.id);
    try {
      if (plan.price === 0) {
        await api.patch('/stripe/change-plan', { planId: plan.id });
        await load();
        toast.success(`Switched to the ${plan.name} plan.`);
      } else {
        const { checkoutUrl } = await api.post<{ checkoutUrl: string }>('/stripe/checkout-session', {
          planId: plan.id,
        });
        window.location.href = checkoutUrl;
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not switch plans';
      setError(message);
      toast.error(message);
      setSwitchingPlanId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-destructive">Could not load your subscription.</p>;
  }

  const { subscription, plans: activePlans } = data;
  // A plan currently assigned but since disabled by an admin still needs to show up here.
  const plans =
    subscription && !activePlans.some((p) => p.id === subscription.planId)
      ? [...activePlans, subscription.plan]
      : activePlans;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1">Plan &amp; billing</h1>
          <p className="text-sm text-muted-foreground">See your current plan and switch to a different one anytime.</p>
        </div>
        <Link to="/" className="mb-4 text-sm font-medium underline-offset-4 hover:underline">
          Continue to dashboard →
        </Link>
      </div>

      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current subscription</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{subscription.plan.name}</span>
            <Badge variant={STATUS_VARIANT[subscription.status] ?? 'secondary'}>{subscription.status}</Badge>
            {subscription.status !== 'ACTIVE' && (
              <span className="text-xs text-muted-foreground">
                {subscription.status === 'INACTIVE'
                  ? 'Payment not completed yet — finish checkout below to activate it.'
                  : 'This subscription has expired.'}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === subscription?.planId}
            currentStatus={plan.id === subscription?.planId ? subscription?.status : undefined}
            switching={switchingPlanId === plan.id}
            onSwitch={() => switchTo(plan)}
          />
        ))}
      </div>
    </div>
  );
}
