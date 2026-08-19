import { Navigate, Route, Routes } from 'react-router-dom';
import { BarChart3, CreditCard, FileText, Link2, PenSquare } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Sidebar,
  SidebarBrand,
  SidebarFooter,
  SidebarNav,
  SidebarNavLink,
  SidebarShell,
  SidebarThemeToggle,
  SidebarToggle,
  SidebarUser,
  Skeleton,
  Toaster,
} from '@syncpost/ui';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Login from '../pages/Login';
import Signup from '../pages/Signup';
import Dashboard from '../pages/Dashboard';
import Posts from '../pages/Posts';
import PostDetail from '../pages/PostDetail';
import Connections from '../pages/Connections';
import Billing from '../pages/Billing';
import Analytics from '../pages/Analytics';
import OAuthCallback from '../pages/OAuthCallback';
import BillingSuccess from '../pages/BillingSuccess';
import BillingCancelled from '../pages/BillingCancelled';

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <SidebarShell>
      <Sidebar>
        <div className="mb-7 flex items-center justify-between">
          <SidebarBrand>SyncPost</SidebarBrand>
          <SidebarToggle />
        </div>
        {user && (
          <>
            <SidebarNav>
              <SidebarNavLink to="/" end icon={PenSquare}>
                Create post
              </SidebarNavLink>
              <SidebarNavLink to="/posts" icon={FileText}>
                Posts
              </SidebarNavLink>
              <SidebarNavLink to="/connections" icon={Link2}>
                Connections
              </SidebarNavLink>
              <SidebarNavLink to="/analytics" icon={BarChart3}>
                Analytics
              </SidebarNavLink>
              <SidebarNavLink to="/billing" icon={CreditCard}>
                Plan &amp; billing
              </SidebarNavLink>
            </SidebarNav>
            <SidebarFooter>
              <SidebarThemeToggle />
              <SidebarUser name={user.name} onLogout={logout} />
            </SidebarFooter>
          </>
        )}
      </Sidebar>
      <main className="mx-auto w-full max-full flex-1 px-8 py-10">
        {children}
      </main>
    </SidebarShell>
  );
}

// Shown while the initial /auth/me check is in flight. Reusing the real Sidebar
// shell (instead of a plain spinner) means a returning, already-logged-in visitor
// — the common case — sees the final layout's shape immediately instead of a
// jarring blank-then-pop-in.
function AppShellSkeleton() {
  return (
    <SidebarShell>
      <Sidebar>
        <div className="mb-7 flex items-center justify-between">
          <SidebarBrand>SyncPost</SidebarBrand>
        </div>
        <div className="flex-1 space-y-1.5 pt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <SidebarFooter>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </SidebarFooter>
      </Sidebar>
      <main className="mx-auto w-full max-full flex-1 space-y-4 px-8 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </main>
    </SidebarShell>
  );
}

// Shown while checking auth before a public page (login/signup) — a logged-out
// visitor is the common case here, so this mimics that card instead of the app shell.
function AuthCardSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppShellSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthCardSkeleton />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <Toaster />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <Signup />
            </PublicOnlyRoute>
          }
        />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/billing/success"
          element={
            <ProtectedRoute>
              <BillingSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/cancelled"
          element={
            <ProtectedRoute>
              <BillingCancelled />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/posts"
          element={
            <ProtectedRoute>
              <Posts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/posts/:id"
          element={
            <ProtectedRoute>
              <PostDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/connections"
          element={
            <ProtectedRoute>
              <Connections />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <Billing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
