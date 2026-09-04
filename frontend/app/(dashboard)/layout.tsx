'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../providers';
import { Sidebar } from '../../components/layout/Sidebar';
import { GlobalSearch } from '../../components/layout/GlobalSearch';
import { SWRProvider } from '../../components/providers/SWRProvider';
import { C } from '../../lib/tokens';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    // If no token in storage and no user in context, redirect to login
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('lm_token');
      if (!token) router.push('/login');
    }
  }, [router]);

  // Handle global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: C.bg }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <SWRProvider>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SWRProvider>
      </div>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
