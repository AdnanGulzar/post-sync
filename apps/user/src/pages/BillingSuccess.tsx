import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@syncpost/ui';
import { api } from '../lib/api';

export default function BillingSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'active' | 'pending' | 'error'>('checking');

  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId) {
      setStatus('error');
      return;
    }
    api
      .get<{ status: 'active' | 'pending' }>(`/stripe/checkout-session/${sessionId}`)
      .then((res) => setStatus(res.status))
      .catch(() => setStatus('error'));
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>
            {status === 'checking' && 'Confirming your payment...'}
            {status === 'active' && "You're all set!"}
            {status === 'pending' && 'Almost there'}
            {status === 'error' && 'Something went wrong'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {status === 'checking' && 'Give us a moment while we confirm your subscription with Stripe.'}
            {status === 'active' && 'Your subscription is active — you can start posting now.'}
            {status === 'pending' &&
              "Stripe hasn't confirmed your payment yet. This usually only takes a few seconds — try refreshing."}
            {status === 'error' && "We couldn't confirm this checkout session. If you were charged, contact support."}
          </p>
          {status === 'active' && <Button className="w-full" onClick={() => navigate('/')}>Go to dashboard</Button>}
          {status === 'pending' && (
            <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          )}
          {status === 'error' && (
            <Link to="/login" className="text-sm font-medium underline-offset-4 hover:underline">
              Back to log in
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
