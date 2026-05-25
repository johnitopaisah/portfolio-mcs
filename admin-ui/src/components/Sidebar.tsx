'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconGrid, IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconClipboard, IconBookOpen, IconMail, IconLogOut,
} from './Icons';

type NavChild = { href: string; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> };
type NavItem  = NavChild & { children?: NavChild[] };

const nav: NavItem[] = [
  { href: '/dashboard',                label: 'Dashboard',      Icon: IconGrid      },
  { href: '/dashboard/projects',       label: 'Projects',       Icon: IconFolder    },
  { href: '/dashboard/skills',         label: 'Skills',         Icon: IconZap       },
  { href: '/dashboard/experience',     label: 'Experience',     Icon: IconBriefcase },
  { href: '/dashboard/certifications', label: 'Certifications', Icon: IconAward     },
  { href: '/dashboard/messages',       label: 'Messages',       Icon: IconMessage   },
  { href: '/dashboard/profile',        label: 'Profile',        Icon: IconUser      },
  { href: '/dashboard/ai',             label: 'AI Engine',      Icon: IconCpu       },
  { href: '/dashboard/jobs',           label: 'Job Pipeline',   Icon: IconLayers    },
  {
    href:     '/dashboard/applications',
    label:    'Applications',
    Icon:     IconClipboard,
    children: [
      { href: '/dashboard/cv-library',     label: 'CV Library',     Icon: IconBookOpen },
      { href: '/dashboard/email-tracking', label: 'Email Tracking', Icon: IconMail     },
    ],
  },
];

export default function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
  }

  return (
    <aside
      className="w-64 h-full flex flex-col select-none"
      style={{
        background:     'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(20px)',
        borderRight:    '1px solid rgba(124,58,237,0.1)',
        boxShadow:      '4px 0 32px rgba(124,58,237,0.06)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(124,58,237,0.08)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              boxShadow:  '0 0 0 3px rgba(124,58,237,0.15), 0 4px 14px rgba(124,58,237,0.35)',
            }}
          >
            PA
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm tracking-tight truncate" style={{ color: '#1a1b2e' }}>
              Portfolio Admin
            </p>
            <p className="text-xs truncate" style={{ color: '#9298b8' }}>johnisah.com</p>
          </div>
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 py-3 px-2.5 overflow-y-auto flex flex-col gap-px">
        {nav.map(({ href, label, Icon, children }) => {
          const active      = isActive(href);
          const childActive = children?.some(c => isActive(c.href)) ?? false;

          return (
            <div key={href}>
              <Link
                href={href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  ...(active ? {
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    color:      '#ffffff',
                    boxShadow:  '0 2px 14px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                  } : childActive ? {
                    background: 'rgba(124,58,237,0.07)',
                    color:      '#5a5f80',
                  } : {
                    color: '#9298b8',
                  }),
                  transition: 'background 0.15s, color 0.15s, transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'rgba(124,58,237,0.08)';
                  el.style.color      = '#7c3aed';
                  el.style.transform  = 'translateX(3px)';
                }}
                onMouseLeave={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = childActive ? 'rgba(124,58,237,0.07)' : 'transparent';
                  el.style.color      = childActive ? '#5a5f80' : '#9298b8';
                  el.style.transform  = 'translateX(0)';
                }}
              >
                <Icon width={16} height={16} className="shrink-0" style={{ opacity: active ? 1 : 0.7 }} />
                <span className="truncate">{label}</span>
              </Link>

              {children && (
                <div
                  className="ml-3.5 mt-0.5 mb-0.5 pl-4 flex flex-col gap-px"
                  style={{ borderLeft: '1px solid rgba(124,58,237,0.15)' }}
                >
                  {children.map(child => {
                    const ca = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium"
                        style={{
                          ...(ca ? {
                            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                            color:      '#ffffff',
                            boxShadow:  '0 2px 10px rgba(124,58,237,0.25)',
                          } : {
                            color: '#9298b8',
                          }),
                          transition: 'background 0.15s, color 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={e => {
                          if (ca) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'rgba(124,58,237,0.07)';
                          el.style.color      = '#7c3aed';
                          el.style.transform  = 'translateX(2px)';
                        }}
                        onMouseLeave={e => {
                          if (ca) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'transparent';
                          el.style.color      = '#9298b8';
                          el.style.transform  = 'translateX(0)';
                        }}
                      >
                        <child.Icon width={13} height={13} className="shrink-0" style={{ opacity: 0.7 }} />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Sign out ───────────────────────────────────────── */}
      <div className="p-2.5" style={{ borderTop: '1px solid rgba(124,58,237,0.08)' }}>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium"
          style={{ color: '#9298b8', transition: 'background 0.15s, color 0.15s' }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = '#dc2626';
            el.style.background = 'rgba(220,38,38,0.07)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = '#9298b8';
            el.style.background = 'transparent';
          }}
        >
          <IconLogOut width={16} height={16} className="shrink-0" style={{ opacity: 0.7 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
