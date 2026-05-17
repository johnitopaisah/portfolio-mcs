'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconGrid, IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconLogOut,
} from './Icons';

const nav = [
  { href: '/dashboard',                label: 'Dashboard',      Icon: IconGrid      },
  { href: '/dashboard/projects',       label: 'Projects',       Icon: IconFolder    },
  { href: '/dashboard/skills',         label: 'Skills',         Icon: IconZap       },
  { href: '/dashboard/experience',     label: 'Experience',     Icon: IconBriefcase },
  { href: '/dashboard/certifications', label: 'Certifications', Icon: IconAward     },
  { href: '/dashboard/messages',       label: 'Messages',       Icon: IconMessage   },
  { href: '/dashboard/profile',        label: 'Profile',        Icon: IconUser      },
  { href: '/dashboard/ai',             label: 'AI Engine',      Icon: IconCpu       },
  { href: '/dashboard/jobs',           label: 'Job Pipeline',   Icon: IconLayers    },
];

interface SidebarProps { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
  }

  const content = (
    <aside
      className="w-64 min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0c1526 0%, #080d18 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 select-none"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 12px rgba(79,70,229,0.4)' }}
          >
            PA
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm tracking-tight truncate">Portfolio Admin</p>
            <p className="text-xs truncate" style={{ color: '#475569' }}>johnisah.com</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group"
              style={active ? {
                background: 'linear-gradient(135deg, rgba(124,58,237,0.75), rgba(79,70,229,0.75))',
                color: '#fff',
                boxShadow: '0 3px 10px rgba(79,70,229,0.3)',
              } : {
                color: '#475569',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#475569'; } }}
            >
              <Icon width={17} height={17} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: '#475569' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <IconLogOut width={17} height={17} className="shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex flex-shrink-0">{content}</div>

      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} aria-hidden />
      )}

      {/* Mobile drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {content}
      </div>
    </>
  );
}
