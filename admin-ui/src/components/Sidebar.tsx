'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IconGrid, IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconClipboard,
  IconBookOpen, IconMail, IconLogOut, IconLink, IconGraduation,
  IconUsers,
} from './Icons';
import { logout } from '@/lib/authSession';

// ── Inline icons ──────────────────────────────────────────────────────────────
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
const IconChevron = ({ rotated, style, ...p }: { rotated: boolean } & React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: rotated ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', ...style }}
    {...p}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const IconExternalLink = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IconSearch = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

// ── Nav structure ─────────────────────────────────────────────────────────────
type NavChild   = { href: string; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> };
type NavItem    = NavChild & { children?: NavChild[] };
type NavSection = { label: string | null; items: NavItem[] };

const sections: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', Icon: IconGrid },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { href: '/projects',       label: 'Projects',       Icon: IconFolder     },
      { href: '/skills',         label: 'Skills',         Icon: IconZap        },
      { href: '/experience',     label: 'Experience',     Icon: IconBriefcase  },
      { href: '/certifications', label: 'Certifications', Icon: IconAward      },
      { href: '/education',      label: 'Education',      Icon: IconGraduation },
      { href: '/referees',       label: 'Referees',       Icon: IconUsers      },
      { href: '/blog',           label: 'Blog',           Icon: IconBookOpen   },
    ],
  },
  {
    label: 'Career Hub',
    items: [
      { href: '/jobs',  label: 'Job Pipeline', Icon: IconLayers },
      {
        href: '/applications', label: 'Applications', Icon: IconClipboard,
        children: [
          { href: '/cv-library',      label: 'CV Library',      Icon: IconBookOpen },
          { href: '/email-tracking',  label: 'Email Tracking',  Icon: IconMail     },
          { href: '/star-stories',    label: 'STAR Stories',    Icon: IconStar     },
          { href: '/email-templates', label: 'Email Templates', Icon: IconMail     },
        ],
      },
      { href: '/goals',   label: 'My Goals',    Icon: IconTarget },
      { href: '/targets', label: 'Job Targets', Icon: IconSearch },
      { href: '/ai',      label: 'AI Engine',   Icon: IconCpu    },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/messages', label: 'Messages', Icon: IconMessage },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/profile', label: 'Profile', Icon: IconUser,
        children: [
          { href: '/profile/cv-identity', label: 'CV Identity',  Icon: IconId   },
          { href: '/social-links',        label: 'Social Links', Icon: IconLink },
        ],
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();

  // Persist expand/collapse state across sessions
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('sidebar-expanded') ?? '{}'); }
    catch { return {}; }
  });

  // Auto-expand parent group when navigating directly to a child route
  useEffect(() => {
    const toExpand: Record<string, boolean> = {};
    for (const section of sections) {
      for (const item of section.items) {
        if (item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))) {
          toExpand[item.href] = true;
        }
      }
    }
    if (Object.keys(toExpand).length === 0) return;
    setExpanded(prev => {
      const next = { ...prev, ...toExpand };
      try { localStorage.setItem('sidebar-expanded', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pathname]);

  function toggle(href: string) {
    setExpanded(prev => {
      const next = { ...prev, [href]: !prev[href] };
      try { localStorage.setItem('sidebar-expanded', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside
      className="w-64 flex flex-col select-none"
      style={{
        height:               '100%',
        overflow:             'hidden',
        background:           'rgba(10,3,28,0.78)',
        backdropFilter:       'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRight:          '1px solid rgba(255,255,255,0.08)',
        boxShadow:            '4px 0 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href="/" className="flex items-center gap-3" aria-label="Home">
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
        </Link>
      </div>

      {/* ── Navigation (independent scroll) ─────────────────────── */}
      <nav
        className="flex-1 py-4 px-2.5 flex flex-col"
        style={{ overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}
      >
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-5' : ''}>

            {/* Section label */}
            {section.label && (
              <div className="px-3 mb-2 flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest shrink-0"
                  style={{ color: 'rgba(255,255,255,0.22)' }}
                >
                  {section.label}
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
            )}

            {/* Nav items */}
            <div className="flex flex-col gap-px">
              {section.items.map(({ href, label, Icon, children }) => {
                const active      = isActive(href);
                const hasChildren = !!children?.length;
                const isOpen      = expanded[href] ?? false;
                const childActive = children?.some(c => isActive(c.href)) ?? false;
                const highlighted = active || childActive;

                return (
                  <div key={href}>
                    {/* Parent row — link + optional chevron button */}
                    <div className="flex items-center gap-1">
                      <Link
                        href={href}
                        onClick={onClose}
                        className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 min-w-0"
                        style={highlighted ? {
                          background: 'linear-gradient(135deg, rgba(168,85,247,0.28), rgba(139,92,246,0.18))',
                          color:      '#DDD6FE',
                          boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.06)',
                        } : { color: 'rgba(255,255,255,0.45)' }}
                        onMouseEnter={e => {
                          if (highlighted) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'rgba(168,85,247,0.1)';
                          el.style.color      = '#DDD6FE';
                          el.style.transform  = 'translateX(2px)';
                        }}
                        onMouseLeave={e => {
                          if (highlighted) return;
                          const el = e.currentTarget as HTMLElement;
                          el.style.background = 'transparent';
                          el.style.color      = 'rgba(255,255,255,0.45)';
                          el.style.transform  = 'translateX(0)';
                        }}
                      >
                        <Icon
                          width={15} height={15}
                          className="shrink-0"
                          style={{ opacity: highlighted ? 1 : 0.5 }}
                        />
                        <span className="truncate">{label}</span>
                      </Link>

                      {hasChildren && (
                        <button
                          onClick={() => toggle(href)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg mr-1 transition-all duration-150"
                          style={{ color: isOpen ? 'rgba(168,85,247,0.85)' : 'rgba(255,255,255,0.22)' }}
                          onMouseEnter={e => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.background = 'rgba(168,85,247,0.12)';
                            el.style.color      = '#DDD6FE';
                          }}
                          onMouseLeave={e => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.background = 'transparent';
                            el.style.color      = isOpen ? 'rgba(168,85,247,0.85)' : 'rgba(255,255,255,0.22)';
                          }}
                        >
                          <IconChevron rotated={isOpen} width={11} height={11} />
                        </button>
                      )}
                    </div>

                    {/* Children — visible when expanded */}
                    {hasChildren && isOpen && (
                      <div
                        className="ml-5 mt-1 mb-1 pl-3 flex flex-col gap-px"
                        style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {children!.map(child => {
                          const ca = isActive(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onClose}
                              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                              style={ca ? {
                                background: 'rgba(168,85,247,0.18)',
                                color:      '#DDD6FE',
                              } : { color: 'rgba(255,255,255,0.38)' }}
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
                                el.style.color      = 'rgba(255,255,255,0.38)';
                                el.style.transform  = 'translateX(0)';
                              }}
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: ca ? '#A855F7' : 'rgba(255,255,255,0.2)' }}
                              />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div
        className="p-2.5 shrink-0 flex flex-col gap-0.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <a
          href="https://johnisah.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.32)' }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = 'rgba(168,85,247,0.9)';
            el.style.background = 'rgba(168,85,247,0.08)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = 'rgba(255,255,255,0.32)';
            el.style.background = 'transparent';
          }}
        >
          <IconExternalLink width={14} height={14} className="shrink-0" style={{ opacity: 0.6 }} />
          View site
        </a>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: 'rgba(255,255,255,0.32)' }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = '#f87171';
            el.style.background = 'rgba(239,68,68,0.1)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color      = 'rgba(255,255,255,0.32)';
            el.style.background = 'transparent';
          }}
        >
          <IconLogOut width={14} height={14} className="shrink-0" style={{ opacity: 0.55 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
