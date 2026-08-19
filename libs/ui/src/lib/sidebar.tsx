import * as React from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { ChevronsLeft, LogOut, Moon, Sun, type LucideIcon } from 'lucide-react';

import { cn } from './utils';
import { Button } from './button';
import { useTheme } from './theme-provider';

const STORAGE_KEY = 'syncpost_sidebar_collapsed';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined);

function useSidebarContext(component: string): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error(`<${component}> must be used inside <Sidebar>`);
  return ctx;
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen bg-muted/40">{children}</div>;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  const toggle = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <aside
        className={cn(
          'sticky top-0 flex h-screen shrink-0 flex-col overflow-visible border-r bg-background p-4 transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[4.25rem] px-2.5' : 'w-56',
        )}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
}

/** Small chevron button that collapses the sidebar to an icon-only rail. State persists across reloads. */
export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useSidebarContext('SidebarToggle');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      <ChevronsLeft className={cn('h-3.5 w-3.5 transition-transform duration-200', collapsed && 'rotate-180')} />
    </button>
  );
}

export function SidebarBrand({ children, className }: { children: React.ReactNode; className?: string }) {
  const { collapsed } = useSidebarContext('SidebarBrand');
  return (
    <div className={cn('flex min-w-0 items-center gap-2 px-1 text-[0.9375rem] font-semibold tracking-tight', className)}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-gradient-to-br from-primary to-primary/70 font-mono text-[0.6875rem] font-bold text-primary-foreground shadow-sm">
        S
      </span>
      {!collapsed && <span className="truncate transition-opacity duration-150">{children}</span>}
    </div>
  );
}

export function SidebarNav({ children }: { children: React.ReactNode }) {
  return <nav className="flex flex-1 flex-col gap-1 pt-1">{children}</nav>;
}

interface SidebarNavLinkProps extends Omit<NavLinkProps, 'children'> {
  icon?: LucideIcon;
  children?: React.ReactNode;
}

export function SidebarNavLink({ className, icon: Icon, children, ...props }: SidebarNavLinkProps) {
  const { collapsed } = useSidebarContext('SidebarNavLink');
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 ease-out',
          'hover:translate-x-0.5 hover:bg-muted hover:text-foreground',
          isActive &&
            'border-primary bg-primary/10 text-primary hover:translate-x-0 hover:bg-primary/10 hover:text-primary',
          collapsed && 'justify-center px-0',
          typeof className === 'function' ? undefined : className,
        )
      }
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {!collapsed && <span className="truncate">{children}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
          {children}
        </span>
      )}
    </NavLink>
  );
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 space-y-2 border-t pt-3">{children}</div>;
}

/** Collapse-aware account row (avatar + name) with a built-in log-out button. */
export function SidebarUser({
  name,
  subtitle,
  onLogout,
}: {
  name: string;
  subtitle?: string;
  onLogout: () => void;
}) {
  const { collapsed } = useSidebarContext('SidebarUser');
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="space-y-2">
      <div className={cn('group relative flex items-center gap-2 px-1', collapsed && 'justify-center px-0')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initial}
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] font-medium text-foreground">{name}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        ) : (
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
            {name}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size={collapsed ? 'icon' : 'sm'}
        className={cn(!collapsed && 'w-full justify-start gap-2')}
        onClick={onLogout}
        aria-label="Log out"
        title="Log out"
      >
        <LogOut className="h-3.5 w-3.5" />
        {!collapsed && 'Log out'}
      </Button>
    </div>
  );
}

/** Collapse-aware theme toggle styled to match SidebarUser's Log out button exactly. */
export function SidebarThemeToggle() {
  const { collapsed } = useSidebarContext('SidebarThemeToggle');
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size={collapsed ? 'icon' : 'sm'}
      className={cn(!collapsed && 'w-full justify-start gap-2')}
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {!collapsed && (isDark ? 'Light mode' : 'Dark mode')}
    </Button>
  );
}
