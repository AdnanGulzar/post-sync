import { Navigate, Route, Routes } from 'react-router-dom';
import {
  Button,
  Sidebar,
  SidebarBrand,
  SidebarFooter,
  SidebarNav,
  SidebarNavLink,
  SidebarShell,
  ThemeToggle,
  Toaster,
} from '@syncpost/ui';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Login from '../pages/Login';
import Users from '../pages/Users';
import Plans from '../pages/Plans';

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <SidebarShell>
      <Sidebar>
        <div className="mb-7 flex items-center justify-between">
          <SidebarBrand>SyncPost Admin</SidebarBrand>
          <ThemeToggle size="icon" className="h-7 w-7" />
        </div>
        {user && (
          <>
            <SidebarNav>
              <SidebarNavLink to="/" end>
                Users
              </SidebarNavLink>
              <SidebarNavLink to="/plans">
                Plans
              </SidebarNavLink>
            </SidebarNav>
            <SidebarFooter>
              <p className="mb-2 px-1 text-[0.8125rem] text-muted-foreground">
                {user.name}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={logout}
              >
                Log out
              </Button>
            </SidebarFooter>
          </>
        )}
      </Sidebar>
      <main className="mx-auto w-full  flex-1 px-8 py-10">{children}</main>
    </SidebarShell>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p className="mt-16 text-center text-muted-foreground">Loading...</p>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p className="mt-16 text-center text-muted-foreground">Loading...</p>
    );
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
      </Routes>
    </AuthProvider>
  );
}

export default App;
