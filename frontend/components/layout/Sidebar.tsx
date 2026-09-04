'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../app/providers';
import { C } from '../../lib/tokens';
import {
  LayoutDashboard,
  AlertTriangle,
  Activity,
  Cpu,
  RefreshCw,
  ListOrdered,
  LogOut,
  Zap
} from 'lucide-react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exceptions', label: 'Exceptions', icon: AlertTriangle, badge: true },
  { href: '/actions', label: 'Actions', icon: Activity },
  { href: '/ai-controller', label: 'AI Controller', icon: Cpu },
  { href: '/reconciliation', label: 'Reconciliation', icon: RefreshCw },
  { href: '/transactions', label: 'Transactions', icon: ListOrdered },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col h-screen sticky top-0"
      style={{ backgroundColor: C.surface, borderRight: `1px solid ${C.border}` }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div 
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: C.primary }}
        >
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight" style={{ color: C.textPrimary }}>LedgerMind</div>
          <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: C.textMuted }}>AI Controller</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? C.primaryTint : 'transparent',
                color: active ? C.primary : C.textSecondary,
              }}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {badge && (
                <span 
                  className="ml-auto flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: C.criticalTint, color: C.critical }}
                >
                  !
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: C.neutralTint, color: C.textPrimary }}
          >
            {user?.name?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: C.textPrimary }}>{user?.name ?? 'Guest'}</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: C.textMuted }}>{user?.role ?? ''}</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            style={{ color: C.textMuted }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
