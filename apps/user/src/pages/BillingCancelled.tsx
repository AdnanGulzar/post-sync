import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@syncpost/api-client';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@syncpost/ui';
import { api } from '../lib/api';

export default function BillingCancelled() {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const { checkoutUrl } = await api.post<{ checkoutUrl: string }>('/stripe/checkout-session');
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start checkout again');
      setRetrying(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Checkout cancelled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No payment was made and your account isn't active yet. You can try again whenever you're ready.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={retrying} onClick={retry}>
            {retrying ? 'Redirecting...' : 'Try payment again'}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
            Back to log in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
