'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SidebarContent from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!localStorage.getItem('admin_token')) router.replace('/login');
  }, [router]);

  function openSidebar() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDesktopOpen(true);
  }
  function closeSidebar() {
    closeTimer.current = setTimeout(() => setDesktopOpen(false), 120);
  }

  return (
    <div className="flex min-h-screen">

      {/* ── Desktop push sidebar ─────────────────────────── */}
      <div
        className="hidden md:flex flex-col shrink-0 overflow-hidden relative"
        style={{
          width:      desktopOpen ? '256px' : '4px',
          minWidth:   desktopOpen ? '256px' : '4px',
          transition: 'width 0.34s cubic-bezier(0.32,0.72,0,1), min-width 0.34s cubic-bezier(0.32,0.72,0,1)',
          boxShadow:  desktopOpen ? '4px 0 40px rgba(0,0,0,0.5), 1px 0 0 rgba(255,255,255,0.06)' : 'none',
        }}
        onMouseEnter={openSidebar}
        onMouseLeave={closeSidebar}
      >
        <div className="h-full" style={{ width: '256px', minWidth: '256px' }}>
          <SidebarContent onClose={() => {}} />
        </div>
      </div>

      {/* ── Sidebar peek tab ─────────────────────────────── */}
      <div
        className="hidden md:block fixed z-20"
        style={{
          left:      desktopOpen ? '-32px' : '4px',
          top:       '50%',
          transform: 'translateY(-50%)',
          transition:'left 0.34s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease',
          opacity:   desktopOpen ? 0 : 1,
          pointerEvents: desktopOpen ? 'none' : 'auto',
        }}
        onMouseEnter={openSidebar}
        onMouseLeave={closeSidebar}
      >
        <div style={{
          width: '20px', height: '80px',
          background: 'linear-gradient(180deg, rgba(168,85,247,0.3), rgba(168,85,247,0.7), rgba(168,85,247,0.3))',
          borderRadius: '0 14px 14px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '3px 0 18px rgba(168,85,247,0.3)',
          animation: 'tab-breathe 2.8s ease-in-out infinite',
        }}>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path d="M1 1l6 6-6 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Mobile overlay ───────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMobileOpen(false)} aria-hidden />
      )}
      <div className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </div>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col"
        onMouseMove={e => { if (!desktopOpen && e.clientX < 128) openSidebar(); }}>

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
          style={{
            background: 'rgba(15,6,39,0.82)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
          }}>
          <button onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Open menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <p className="font-semibold text-sm text-white">Portfolio Admin</p>
        </div>

        <main className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
