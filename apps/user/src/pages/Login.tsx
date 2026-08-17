import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, ThemeToggle } from '@syncpost/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '@syncpost/api-client';
import OAuthButtons from '../components/OAuthButtons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted px-4">
      <ThemeToggle className="absolute right-4 top-4 h-8 w-8" />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
            S
          </span>
          <CardTitle>Log in to SyncPost</CardTitle>
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
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log in'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            No account yet?{' '}
            <Link to="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
