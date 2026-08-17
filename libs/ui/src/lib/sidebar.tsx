import * as React from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';

import { cn } from './utils';

export function SidebarShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen bg-muted/40">{children}</div>;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-background p-4">
      {children}
    </aside>
  );
}

export function SidebarBrand({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-1 text-[0.9375rem] font-semibold tracking-tight', className)}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-primary font-mono text-[0.6875rem] font-bold text-primary-foreground">
        S
      </span>
      {children}
    </div>
  );
}

export function SidebarNav({ children }: { children: React.ReactNode }) {
  return <nav className="flex flex-1 flex-col gap-0.5">{children}</nav>;
}

export function SidebarNavLink({ className, ...props }: NavLinkProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          '-ml-0.5 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'border-primary bg-muted text-foreground',
          typeof className === 'function' ? undefined : className,
        )
      }
      {...props}
    />
  );
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 border-t pt-3">{children}</div>;
}
