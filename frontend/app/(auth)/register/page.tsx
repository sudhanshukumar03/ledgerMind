'use client';

import Link from 'next/link';
import { C } from '../../../lib/tokens';
import { Logo } from '../../../components/ui/Logo';
import { ArrowLeft, ShieldCheck, UserCheck } from 'lucide-react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: C.bg }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]" 
          style={{ backgroundColor: C.primaryTint }}
        />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
          <Logo className="h-10 w-auto mb-2" />
          <p className="text-sm mt-1" style={{ color: C.textSecondary }}>AI Finance Controller</p>
        </div>

        {/* Card */}
        <div className="card p-6 border shadow-sm rounded-xl" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.primaryTint, color: C.primary }}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: C.textPrimary }}>Enterprise Registration</h2>
              <p className="text-xs" style={{ color: C.textMuted }}>Tenant Organization Provisioning</p>
            </div>
          </div>

          <div className="rounded-lg p-4 mb-6 border text-xs space-y-2" style={{ backgroundColor: C.bg, borderColor: C.border, color: C.textSecondary }}>
            <p className="font-medium" style={{ color: C.textPrimary }}>LedgerMind operates on an invitation-only model for verified corporate merchants.</p>
            <p>New merchant accounts and team members are provisioned directly by your organization administrator or via enterprise SSO.</p>
          </div>

          <div className="space-y-3 mb-6 text-xs" style={{ color: C.textMuted }}>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Multi-tenant isolation with deterministic ledger guards</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Role-based access control (Admin, Finance, Viewer)</span>
            </div>
          </div>

          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.primary }}
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
