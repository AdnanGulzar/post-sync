import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(params.get('error'));

  useEffect(() => {
    const token = params.get('token');
    if (!token) return;
    loginWithToken(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('Could not complete sign-in. Please try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-sm text-center">
          <p className="mb-3 text-sm text-destructive">{error}</p>
          <Link to="/login" className="text-sm font-medium underline-offset-4 hover:underline">
            Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
}
