import { useEffect, useState } from 'react';
import { AdminBillingOverview } from '@syncpost/api-client';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HorizontalBarChart,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@syncpost/ui';
import { api } from '../lib/api';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  EXPIRED: 'destructive',
};

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const [data, setData] = useState<AdminBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminBillingOverview>('/admin/billing')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-destructive">Could not load billing data.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Subscriber and revenue overview, plus recent payments from Stripe.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="MRR" value={`$${data.mrr.toLocaleString()}`} />
        <StatTile label="Total subscribers" value={data.totalSubscribers} />
        <StatTile label="Active" value={data.byStatus.ACTIVE} />
        <StatTile label="Inactive / Expired" value={data.byStatus.INACTIVE + data.byStatus.EXPIRED} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue by plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.byPlan.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active paid subscribers yet.</p>
          ) : (
            <>
              <HorizontalBarChart
                data={data.byPlan.map((p) => ({ key: p.planId, label: p.name, value: p.mrr }))}
                formatValue={(v) => `$${v.toLocaleString()}`}
                labelWidthClassName="w-28"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Subscribers</TableHead>
                    <TableHead>MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byPlan.map((p) => (
                    <TableRow key={p.planId}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>${p.price}/mo</TableCell>
                      <TableCell>{p.subscribers}</TableCell>
                      <TableCell>${p.mrr.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent payments</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.recentPayments.available ? (
            <p className="text-sm text-muted-foreground">
              Stripe isn't configured on the server yet — add STRIPE_SECRET_KEY to see live payment history here.
            </p>
          ) : data.recentPayments.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPayments.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-medium">{p.userName || 'Unknown'}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{p.userEmail}</span>
                    </TableCell>
                    <TableCell>{p.planName || '—'}</TableCell>
                    <TableCell>
                      {p.amount.toFixed(2)} {p.currency.toUpperCase()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'succeeded' ? 'success' : 'secondary'}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
