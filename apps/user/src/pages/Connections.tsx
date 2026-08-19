import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, ConnectedAccount, SocialPlatform } from '@syncpost/api-client';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, toast } from '@syncpost/ui';
import { api } from '../lib/api';

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

export default function Connections() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingTo, setConnectingTo] = useState<SocialPlatform | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [params] = useSearchParams();

  async function load() {
    setLoading(true);
    const data = await api.get<ConnectedAccount[]>('/social/accounts');
    setAccounts(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const justConnected = params.get('connected');
    const count = Number(params.get('count') || '1');
    const connectedError = params.get('error');
    if (justConnected) {
      toast.success(`Connected ${justConnected}${count > 1 ? ` (${count} destinations found)` : ''}.`);
    }
    if (connectedError) toast.error(connectedError);
  }, []);

  async function connect(platform: SocialPlatform) {
    setConnectingTo(platform);
    try {
      const { url } = await api.get<{ url: string }>(`/social/${platform}/connect`);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not connect ${platform}`);
      setConnectingTo(null);
    }
  }

  async function disconnect(account: ConnectedAccount) {
    setDisconnectingId(account.id);
    try {
      await api.delete(`/social/accounts/${account.id}`);
      await load();
      toast.success(`Disconnected ${account.platformUsername || account.platform}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not disconnect this account');
    } finally {
      setDisconnectingId(null);
    }
  }

  const connectedError = params.get('error');
  const justConnected = params.get('connected');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
      </CardHeader>
      <CardContent>
        {justConnected && (
          <p className="mb-3 text-sm text-success-fg">Connected {justConnected} successfully.</p>
        )}
        {connectedError && <p className="mb-3 text-sm text-destructive">{connectedError}</p>}
        {loading ? (
          <ul className="divide-y">
            {PLATFORMS.map((p) => (
              <li key={p.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-8 w-24" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y">
            {PLATFORMS.map((p) => {
              const destinations = accounts.filter((a) => a.platform === p.key);
              return (
                <li key={p.key} className="py-3 first:pt-0 last:pb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <strong className="text-sm font-medium">{p.label}</strong>
                    <Button size="sm" disabled={connectingTo === p.key} onClick={() => connect(p.key)}>
                      {connectingTo === p.key ? 'Redirecting...' : destinations.length > 0 ? '+ Connect another' : 'Connect'}
                    </Button>
                  </div>
                  {destinations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Not connected.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {destinations.map((d) => (
                        <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <span className="flex items-center gap-2 text-sm">
                            {d.platformUsername || d.id}
                            <Badge variant="secondary">{DESTINATION_LABEL[d.destinationType] || d.destinationType}</Badge>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={disconnectingId === d.id}
                            onClick={() => disconnect(d)}
                          >
                            {disconnectingId === d.id ? 'Disconnecting...' : 'Disconnect'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
