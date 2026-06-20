'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconGrid, IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconClipboard,
  IconBookOpen, IconMail, IconLogOut, IconLink, IconGraduation,
  IconUsers,
} from './Icons';

const IconStar = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconTarget = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>
);
const IconId = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <circle cx="8" cy="12" r="2"/>
    <path d="M14 10h4M14 14h2"/>
  </svg>
);

type NavChild = { href: string; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> };
type NavItem  = NavChild & { children?: NavChild[] };

const nav: NavItem[] = [
  { href: '/dashboard',                label: 'Dashboard',      Icon: IconGrid      },
  { href: '/dashboard/projects',       label: 'Projects',       Icon: IconFolder    },
  { href: '/dashboard/skills',         label: 'Skills',         Icon: IconZap       },
  { href: '/dashboard/experience',     label: 'Experience',     Icon: IconBriefcase },
  { href: '/dashboard/certifications', label: 'Certifications', Icon: IconAward     },
  { href: '/dashboard/education',      label: 'Education',      Icon: IconGraduation },
  { href: '/dashboard/referees',       label: 'Referees',       Icon: IconUsers     },
  { href: '/dashboard/messages',       label: 'Messages',       Icon: IconMessage   },
  {
    href: '/dashboard/profile', label: 'Profile', Icon: IconUser,
    children: [
      { href: '/dashboard/profile/cv-identity', label: 'CV Identity', Icon: IconId   },
      { href: '/dashboard/social-links',        label: 'Social Links', Icon: IconLink },
    ],
  },
  { href: '/dashboard/ai',   label: 'AI Engine',    Icon: IconCpu   },
  { href: '/dashboard/jobs', label: 'Job Pipeline', Icon: IconLayers },
  {
    href: '/dashboard/applications', label: 'Applications', Icon: IconClipboard,
    children: [
      { href: '/dashboard/cv-library',      label: 'CV Library',      Icon: IconBookOpen },
      { href: '/dashboard/email-tracking',  label: 'Email Tracking',  Icon: IconMail     },
      { href: '/dashboard/star-stories',    label: 'STAR Stories',    Icon: IconStar     },
      { href: '/dashboard/email-templates', label: 'Email Templates', Icon: IconMail     },
    ],
  },
  { href: '/dashboard/goals', label: 'My Goals', Icon: IconTarget },
];

export default function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/') || pathname.startsWith(href);
  }

  return (
    <aside
      className="w-64 flex flex-col select-none"
      style={{
        height:      '100%',
        overflow:    'hidden',
        background:  'rgba(10,3,28,0.75)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow:   '4px 0 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6 0%, #A855F7 100%)',
              boxShadow:  '0 0 0 3px rgba(168,85,247,0.2), 0 4px 16px rgba(168,85,247,0.4)',
            }}
          >
            PA
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm tracking-tight truncate text-white">Portfolio Admin</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>johnisah.com</p>
          </div>
        </div>
      </div>

      {/* Navigation — independent scroll */}
      <nav
        className="flex-1 py-3 px-2.5 flex flex-col gap-px"
        style={{ overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}
      >
        {nav.map(({ href, label, Icon, children }) => {
          const active      = isActive(href);
          const childActive = children?.some(c => isActive(c.href)) ?? false;

          return (
            <div key={href}>
              <Link
                href={href}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={
                  active ? {
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.18))',
                    color:      '#DDD6FE',
                    borderLeft: '2px solid #A855F7',
                    paddingLeft:'10px',
                    boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.06)',
                  } : childActive ? {
                    background: 'rgba(168,85,247,0.08)',
                    color:      'rgba(255,255,255,0.7)',
                  } : {
                    color: 'rgba(255,255,255,0.45)',
                  }
                }
                onMouseEnter={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'rgba(168,85,247,0.12)';
                  el.style.color      = '#DDD6FE';
                  el.style.transform  = 'translateX(3px)';
                }}
                onMouseLeave={e => {
                  if (active) return;
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = childActive ? 'rgba(168,85,247,0.08)' : 'transparent';
                  el.style.color      = childActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)';
                  el.style.transform  = 'translateX(0)';
                }}
              >
                <Icon width={16} height={16} className="shrink-0" style={{ opacity: active ? 1 : 0.55 }} />
                <span className="truncate">{label}</span>
              </Link>

              {children && (childActive || active) && (
                <div
                  className="ml-3.5 mt-0.5 mb-0.5 pl-4 flex flex-col gap-px"
                  style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {children.map(child => {
                    const ca = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150"
                        style={ca ? {
                          background: 'rgba(168,85,247,0.18)',
                          color:      '#DDD6FE',
                        } : { color: 'rgba(255,255,255,0.42)' }}
                        onMouseEnter={e => {
                          if (ca) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'rgba(168,85,247,0.1)';
                          el.style.color      = '#DDD6FE';
                          el.style.transform  = 'translateX(2px)';
                        }}
                        onMouseLeave={e => {
                          if (ca) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'transparent';
                          el.style.color      = 'rgba(255,255,255,0.42)';
                          el.style.transform  = 'translateX(0)';
                        }}
                      >
                        <child.Icon width={13} height={13} className="shrink-0" style={{ opacity: 0.6 }} />
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

      {/* Sign out */}
      <div className="p-2.5 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = '#f87171';
            el.style.background = 'rgba(239,68,68,0.1)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = 'rgba(255,255,255,0.4)';
            el.style.background = 'transparent';
          }}
        >
          <IconLogOut width={16} height={16} className="shrink-0" style={{ opacity: 0.55 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
