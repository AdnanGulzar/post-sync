import { useState } from 'react';
import { Button } from '@syncpost/ui';
import { SocialPlatform } from '@syncpost/api-client';
import { api } from '../lib/api';

const PROVIDERS: { key: SocialPlatform; label: string }[] = [
  { key: 'LINKEDIN', label: 'LinkedIn' },
  { key: 'FACEBOOK', label: 'Facebook' },
  { key: 'X', label: 'X' },
];

export default function OAuthButtons() {
  const [pending, setPending] = useState<SocialPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function continueWith(platform: SocialPlatform) {
    setError(null);
    setPending(platform);
    try {
      const { url } = await api.get<{ url: string }>(`/auth/oauth/${platform}`);
      window.location.href = url;
    } catch {
      setError('Could not start sign-in. Try again in a moment.');
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.key}
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending !== null}
          onClick={() => continueWith(p.key)}
        >
          {pending === p.key ? 'Redirecting...' : `Continue with ${p.label}`}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
