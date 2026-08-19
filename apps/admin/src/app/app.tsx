import { Navigate, Route, Routes } from 'react-router-dom';
import { BarChart3, CreditCard, Layers, Users as UsersIcon } from 'lucide-react';
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
import Users from '../pages/Users';
import Plans from '../pages/Plans';
import Billing from '../pages/Billing';
import PostAnalytics from '../pages/PostAnalytics';

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <SidebarShell>
      <Sidebar>
        <div className="mb-7 flex items-center justify-between">
          <SidebarBrand>SyncPost Admin</SidebarBrand>
          <SidebarToggle />
        </div>
        {user && (
          <>
            <SidebarNav>
              <SidebarNavLink to="/" end icon={UsersIcon}>
                Users
              </SidebarNavLink>
              <SidebarNavLink to="/plans" icon={Layers}>
                Plans
              </SidebarNavLink>
              <SidebarNavLink to="/billing" icon={CreditCard}>
                Billing
              </SidebarNavLink>
              <SidebarNavLink to="/post-analytics" icon={BarChart3}>
                Post analytics
              </SidebarNavLink>
            </SidebarNav>
            <SidebarFooter>
              <SidebarThemeToggle />
              <SidebarUser name={user.name} onLogout={logout} />
            </SidebarFooter>
          </>
        )}
      </Sidebar>
      <main className="mx-auto w-full  flex-1 px-8 py-10">{children}</main>
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
          <SidebarBrand>SyncPost Admin</SidebarBrand>
        </div>
        <div className="flex-1 space-y-1.5 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <SidebarFooter>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </SidebarFooter>
      </Sidebar>
      <main className="mx-auto w-full flex-1 space-y-4 px-8 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </main>
    </SidebarShell>
  );
}

// Shown while checking auth before the login page — a logged-out visitor is the
// common case here, so this mimics that card instead of the app shell.
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
          path="/"
          element={
            <ProtectedRoute>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute>
              <Plans />
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
          path="/post-analytics"
          element={
            <ProtectedRoute>
              <PostAnalytics />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
