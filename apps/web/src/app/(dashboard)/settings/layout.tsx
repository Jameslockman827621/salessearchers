'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Shield, Users, Building2, Bell, User, Upload, Download } from 'lucide-react';
import { clsx } from 'clsx';

const settingsNav = [
  { name: 'Profile', href: '/settings/profile', icon: User },
  { name: 'Team', href: '/settings/team', icon: Users },
  { name: 'Notifications', href: '/settings/notifications', icon: Bell },
  { name: 'Integrations', href: '/settings/integrations', icon: Calendar },
  { name: 'Recording', href: '/settings/recording', icon: Shield },
  { name: 'Import / Export', href: '/settings/import-export', icon: Upload },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <aside className="w-64 border-r border-surface-800 bg-surface-900/50 p-4">
        <h2 className="mb-4 px-3 text-sm font-semibold uppercase tracking-wider text-surface-500">
          Settings
        </h2>
        <nav className="space-y-1">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
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
            );
          })}
        </nav>
      </aside>

      {/* Settings content */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

