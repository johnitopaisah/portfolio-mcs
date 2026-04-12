'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const nav = [
  { href: '/dashboard',                label: 'Dashboard',      icon: '▦' },
  { href: '/dashboard/projects',       label: 'Projects',       icon: '◈' },
  { href: '/dashboard/skills',         label: 'Skills',         icon: '◎' },
  { href: '/dashboard/experience',     label: 'Experience',     icon: '◷' },
  { href: '/dashboard/certifications', label: 'Certifications', icon: '✦' },
  { href: '/dashboard/messages',       label: 'Messages',       icon: '✉' },
  { href: '/dashboard/profile',        label: 'Profile',        icon: '◉' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
  }

  function handleNavClick() {
    // Close drawer on mobile after navigating
    onClose();
  }

  const sidebarContent = (
    <aside className="w-60 min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <p className="text-white font-bold text-sm">Portfolio Admin</p>
        <p className="text-gray-500 text-xs mt-0.5">johnisah.com</p>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.map(item => {
          const active = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                     text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors">
          <span className="w-5 text-center">⏻</span>
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* ── Desktop: always visible sidebar ─────────────── */}
      <div className="hidden md:flex flex-shrink-0">
        {sidebarContent}
      </div>

      {/* ── Mobile: slide-in drawer ──────────────────────── */}
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      {/* Drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {sidebarContent}
      </div>
    </>
  );
}
