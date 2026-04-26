'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('admin_token')) router.replace('/login');
  }, [router]);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Mobile top bar — hidden on desktop ─────────── */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3
                        bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg
                       text-gray-400 hover:text-white hover:bg-gray-800 transition-colors
                       text-lg font-light"
            aria-label="Open menu">
            ☰
          </button>
          <p className="text-white font-semibold text-sm">Portfolio Admin</p>
        </div>

        {/* ── Page content ────────────────────────────────── */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
