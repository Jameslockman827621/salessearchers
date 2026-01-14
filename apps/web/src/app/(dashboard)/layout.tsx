'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers';
import {
  LayoutDashboard,
  Video,
  CheckSquare,
  Users,
  Building2,
  Kanban,
  Mail,
  Send,
  Settings,
  LogOut,
  ChevronDown,
  Loader2,
  Lightbulb,
  FolderOpen,
  Linkedin,
  Activity,
  BarChart3,
  Sparkles,
  Zap,
  Phone,
} from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';

// Primary action hub - always visible at top
const primaryNav = [
  { name: 'Work Queue', href: '/work', icon: Zap, highlight: true },
];

// Communication channels
const communicationNav = [
  { name: 'Call Queue', href: '/call-queue', icon: Phone },
  { name: 'Inbox', href: '/inbox', icon: Mail },
  { name: 'LinkedIn', href: '/linkedin', icon: Linkedin },
  { name: 'Sequences', href: '/sequences', icon: Send },
];

// Data management
const dataNav = [
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Data Rooms', href: '/data-rooms', icon: FolderOpen },
];

// Productivity & insights
const insightsNav = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Meetings', href: '/meetings', icon: Video },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'AI Assistant', href: '/ai-assistant', icon: Sparkles },
  { name: 'Automations', href: '/automations', icon: Zap },
  { name: 'Activities', href: '/activities', icon: Activity },
  { name: 'Coaching', href: '/coaching', icon: Lightbulb },
];

// Combined for backwards compatibility
const navigation = [...primaryNav, ...communicationNav, ...dataNav, ...insightsNav];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, isLoading, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    router.replace('/auth/login');
  };

  return (
    <div className="flex h-screen bg-surface-950">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-surface-800 bg-surface-900">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-surface-800 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 font-bold text-white">
            S
          </div>
          <div>
            <h1 className="font-semibold text-surface-100">SalesSearchers</h1>
            <p className="text-xs text-surface-500">{tenant?.name ?? 'Dashboard'}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          {/* Primary Action Hub */}
          <ul className="space-y-1 mb-4">
            {primaryNav.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                        : 'bg-gradient-to-r from-primary-500/10 to-primary-600/10 text-primary-400 hover:from-primary-500/20 hover:to-primary-600/20 border border-primary-500/20'
                    )}
                  >
                    <Icon size={18} />
                    <span>{item.name}</span>
                    <span className="ml-auto text-xs bg-primary-500/30 text-primary-300 px-2 py-0.5 rounded">
                      ⌘K
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Communication */}
          <div className="mb-4">
            <h3 className="px-3 mb-2 text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Communication
            </h3>
            <ul className="space-y-1">
              {communicationNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-500/10 text-primary-400'
                          : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'
                      )}
                    >
                      <Icon size={18} />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Data Management */}
          <div className="mb-4">
            <h3 className="px-3 mb-2 text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Data
            </h3>
            <ul className="space-y-1">
              {dataNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-500/10 text-primary-400'
                          : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'
                      )}
                    >
                      <Icon size={18} />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Insights & Tools */}
          <div className="mb-4">
            <h3 className="px-3 mb-2 text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Insights
            </h3>
            <ul className="space-y-1">
              {insightsNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-500/10 text-primary-400'
                          : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'
                      )}
                    >
                      <Icon size={18} />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-surface-800 pt-4">
            <Link
              href="/settings"
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/settings')
                  ? 'bg-primary-500/10 text-primary-400'
                  : 'text-surface-400 hover:bg-surface-800 hover:text-surface-100'
              )}
            >
              <Settings size={18} />
              <span>Settings</span>
            </Link>
          </div>
        </nav>

        {/* User menu */}
        <div className="border-t border-surface-800 p-4">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-800"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-700 text-sm font-medium text-surface-300">
                {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-surface-100">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user?.email}
                </p>
                <p className="truncate text-xs text-surface-500">{user?.email}</p>
              </div>
              <ChevronDown
                size={16}
                className={clsx('text-surface-500 transition-transform', showUserMenu && 'rotate-180')}
              />
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-lg border border-surface-700 bg-surface-800 p-2 shadow-lg">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-surface-700"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 flex items-center justify-between gap-4 border-b border-surface-800 bg-surface-900 px-6">
          <GlobalSearch />
          <div className="flex items-center gap-2">
            <NotificationsPanel />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
