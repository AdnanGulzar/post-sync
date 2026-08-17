import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, ConnectedAccount, SocialPlatform } from '@syncpost/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton, toast } from '@syncpost/ui';
import { api } from '../lib/api';

const PLATFORMS: { key: SocialPlatform; label: string }[] = [
  { key: 'LINKEDIN', label: 'LinkedIn' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'X', label: 'X (Twitter)' },
];

export default function Connections() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingTo, setConnectingTo] = useState<SocialPlatform | null>(null);
  const [disconnectingFrom, setDisconnectingFrom] = useState<SocialPlatform | null>(null);
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
    const connectedError = params.get('error');
    if (justConnected) toast.success(`Connected ${justConnected} successfully.`);
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

  async function disconnect(platform: SocialPlatform) {
    setDisconnectingFrom(platform);
    try {
      await api.delete(`/social/${platform}`);
      await load();
      toast.success(`Disconnected ${platform}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not disconnect ${platform}`);
    } finally {
      setDisconnectingFrom(null);
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
              const connected = accounts.find((a) => a.platform === p.key);
              return (
                <li key={p.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="text-sm">
                    <strong className="font-medium">{p.label}</strong>
                    <span className="text-muted-foreground">
                      {connected ? ` — connected as ${connected.platformUsername || connected.id}` : ' — not connected'}
                    </span>
                  </span>
                  {connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disconnectingFrom === p.key}
                      onClick={() => disconnect(p.key)}
                    >
                      {disconnectingFrom === p.key ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={connectingTo === p.key} onClick={() => connect(p.key)}>
                      {connectingTo === p.key ? 'Redirecting...' : 'Connect'}
                    </Button>
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
