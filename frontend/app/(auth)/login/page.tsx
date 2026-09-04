'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '../../../lib/api-client';
import { useAuth } from '../../providers';
import { C } from '../../../lib/tokens';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('admin@ledgermind.dev');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      localStorage.setItem('lm_token', res.data.access_token);
      setUser(res.data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.bg }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[120px]" 
          style={{ backgroundColor: C.primaryTint }}
        />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div 
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-sm mb-4"
            style={{ backgroundColor: C.primary }}
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: C.textPrimary }}>LedgerMind</h1>
          <p className="text-sm mt-1" style={{ color: C.textSecondary }}>AI Finance Controller</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1" style={{ color: C.textPrimary }}>Sign in</h2>
          <p className="text-xs mb-6" style={{ color: C.textMuted }}>Access your reconciliation dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: C.textSecondary }}>Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: C.textSecondary }}>Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div 
                className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                style={{ color: C.critical, backgroundColor: C.criticalTint, borderColor: C.criticalTint }}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button id="login-submit" type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-5 pt-4 border-t" style={{ borderColor: C.border }}>
            <p className="text-xs text-center mb-2" style={{ color: C.textMuted }}>Demo credentials</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Admin', email: 'admin@ledgermind.dev' },
                { label: 'Finance', email: 'finance@ledgermind.dev' },
                { label: 'Viewer', email: 'viewer@ledgermind.dev' },
              ].map(({ label, email: e }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setEmail(e); setPassword('demo1234'); }}
                  className="text-xs py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                  style={{ color: C.textSecondary, borderColor: C.border }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
