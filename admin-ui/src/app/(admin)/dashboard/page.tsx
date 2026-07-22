'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import {
  IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconArrow,
} from '@/components/Icons';

type AvailStatus = 'active' | 'passive' | 'not_open';
type DashStats = {
  goal: { target: number; this_week: number; pct: number; streak_weeks: number };
  health_score: { total: number; label: string; color: string };
  due_reminders: Array<{ id: number; title: string; remind_at: string; company_name: string }>;
  pipeline_counts: { prep: number; active: number; interview: number; offer: number; closed: number };
  recent_activity: Array<{ event_type: string; description: string; event_date: string; company_name: string; job_title: string; application_id: number }>;
};

const AVAIL_OPTIONS: { value: AvailStatus; label: string; dot: string }[] = [
  { value: 'active',   label: 'Available',     dot: '#22c55e' },
  { value: 'passive',  label: 'Open to right', dot: '#f59e0b' },
  { value: 'not_open', label: 'Not open',      dot: '#6b7280' },
];

const HEALTH_COLORS: Record<string, { ring: string; bg: string }> = {
  green:  { ring: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
  yellow: { ring: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  red:    { ring: '#f87171', bg: 'rgba(248,113,113,0.08)' },
};

interface PortfolioStats {
  projects: number; skills: number; experiences: number;
  certifications: number; unread: number;
  aiTotal: string; aiKept: string; aiReview: string;
  jobsNew: string; jobsSaved: string; jobsApplied: string;
}

const CARDS = [
  { label: 'Projects',       key: 'projects'       as keyof PortfolioStats, href: '/projects',       from: '#7c3aed', to: '#7C3AED', shadow: 'rgba(79,70,229,0.25)',    Icon: IconFolder,   desc: () => 'Portfolio items' },
  { label: 'Skills',         key: 'skills'         as keyof PortfolioStats, href: '/skills',         from: '#0ea5e9', to: '#A855F7', shadow: 'rgba(14,165,233,0.2)',    Icon: IconZap,      desc: () => 'Technical stack' },
  { label: 'Experience',     key: 'experiences'    as keyof PortfolioStats, href: '/experience',     from: '#f59e0b', to: '#ef4444', shadow: 'rgba(245,158,11,0.2)',    Icon: IconBriefcase,desc: () => 'Work history' },
  { label: 'Certifications', key: 'certifications' as keyof PortfolioStats, href: '/certifications', from: '#10b981', to: '#0d9488', shadow: 'rgba(16,185,129,0.2)',    Icon: IconAward,    desc: () => 'Credentials' },
  { label: 'Messages',       key: 'unread'         as keyof PortfolioStats, href: '/messages',       from: '#f43f5e', to: '#ec4899', shadow: 'rgba(244,63,94,0.2)',     Icon: IconMessage,  desc: (s: PortfolioStats) => s.unread > 0 ? `${s.unread} unread` : 'All read', badge: (s: PortfolioStats) => s.unread > 0 },
  { label: 'Profile',        key: null,                                      href: '/profile',        from: '#a855f7', to: '#d946ef', shadow: 'rgba(168,85,247,0.2)',   Icon: IconUser,     desc: () => 'Edit your profile' },
  { label: 'AI Engine',      key: 'aiTotal'        as keyof PortfolioStats, href: '/ai',             from: '#06b6d4', to: '#3b82f6', shadow: 'rgba(6,182,212,0.2)',     Icon: IconCpu,      desc: (s: PortfolioStats) => `${s.aiKept} kept · ${s.aiReview} review` },
  { label: 'Job Pipeline',   key: 'jobsNew'        as keyof PortfolioStats, href: '/jobs',           from: '#22c55e', to: '#10b981', shadow: 'rgba(34,197,94,0.2)',     Icon: IconLayers,   desc: (s: PortfolioStats) => `${s.jobsSaved} saved · ${s.jobsApplied} applied` },
];

const EMPTY: PortfolioStats = {
  projects: 0, skills: 0, experiences: 0, certifications: 0, unread: 0,
  aiTotal: '—', aiKept: '—', aiReview: '—',
  jobsNew: '—', jobsSaved: '—', jobsApplied: '—',
};

const PIPELINE_LABELS = [
  { key: 'prep',      label: 'Prep',      color: 'rgba(255,255,255,0.45)' },
  { key: 'active',    label: 'Applied',   color: '#A855F7' },
  { key: 'interview', label: 'Interview', color: '#fbbf24' },
  { key: 'offer',     label: 'Offer',     color: '#4ade80' },
  { key: 'closed',    label: 'Closed',    color: 'rgba(255,255,255,0.32)' },
];

export default function DashboardPage() {
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats>(EMPTY);
  const [dashStats, setDashStats]           = useState<DashStats | null>(null);
  const [availStatus, setAvailStatus]       = useState<AvailStatus | null>(null);
  const [savingAvail, setSavingAvail]       = useState(false);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    Promise.allSettled([
      adminApi.getProjects(),
      adminApi.getSkills(),
      adminApi.getExperiences(),
      adminApi.getCertifications(),
      adminApi.getMessages(),
      adminApi.getAiStatus(),
      adminApi.getJobsProgress(),
      adminApi.getProfile(),
      adminApi.getDashboardStats(),
    ]).then(([proj, skills, exp, certs, msgs, ai, jobs, profile, dash]) => {
      const p = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value : null;
      const aiStatus = p(ai) as Record<string, unknown> | null;
      const jobProg  = p(jobs) as Record<string, unknown> | null;
      const prof     = p(profile) as Record<string, unknown> | null;

      setPortfolioStats({
        projects:       (p(proj) as unknown[])?.length  ?? 0,
        skills:         (p(skills) as unknown[])?.length ?? 0,
        experiences:    (p(exp) as unknown[])?.length   ?? 0,
        certifications: (p(certs) as unknown[])?.length ?? 0,
        unread:         (p(msgs) as Array<Record<string,unknown>>)?.filter(m => !m.read).length ?? 0,
        aiTotal:        (aiStatus?.last_24h as Record<string,unknown>)?.total_jobs as string ?? '—',
        aiKept:         (aiStatus?.last_24h as Record<string,unknown>)?.kept as string ?? '—',
        aiReview:       (aiStatus?.last_24h as Record<string,unknown>)?.review as string ?? '—',
        jobsNew:        jobProg?.new_count     as string ?? '—',
        jobsSaved:      jobProg?.saved_count   as string ?? '—',
        jobsApplied:    jobProg?.applied_count as string ?? '—',
      });
      setAvailStatus((prof?.availability_status as AvailStatus) ?? 'active');
      if (p(dash)) setDashStats(p(dash) as DashStats);
    }).finally(() => setLoading(false));
  }, []);

  async function setAvail(val: AvailStatus) {
    if (val === availStatus || savingAvail) return;
    const prev = availStatus;
    setAvailStatus(val);
    setSavingAvail(true);
    try { await adminApi.setAvailabilityStatus(val); }
    catch { setAvailStatus(prev); }
    finally { setSavingAvail(false); }
  }

  const hs   = dashStats?.health_score;
  const hc   = HEALTH_COLORS[hs?.color || 'yellow'];
  const circ = 2 * Math.PI * 40;

  return (
    <div className="p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {/* Availability */}
        <div className="flex gap-1.5 shrink-0 flex-wrap">
          {AVAIL_OPTIONS.map(opt => {
            const active = availStatus === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAvail(opt.value)}
                disabled={savingAvail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                  border: active ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  color: active ? '#22c55e' : 'rgba(255,255,255,0.45)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? opt.dot : 'rgba(255,255,255,0.18)', boxShadow: active ? `0 0 5px ${opt.dot}` : 'none' }} />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top band: health + goal + pipeline + reminders */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* Health score */}
        <div
          className="rounded-2xl p-5 flex flex-col items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${hc?.ring || 'rgba(255,255,255,0.1)'}25` }}
        >
          <p className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>Search Health</p>
          <div className="relative w-24 h-24">
            <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg]">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9"/>
              <circle
                cx="48" cy="48" r="40" fill="none"
                stroke={hc?.ring || '#fbbf24'} strokeWidth="9"
                strokeDasharray={circ}
                strokeDashoffset={circ - ((hs?.total || 0) / 100) * circ}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${hc?.ring || '#fbbf24'}80)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold" style={{ color: hc?.ring || '#fbbf24' }}>{hs?.total ?? '—'}</span>
            </div>
          </div>
          <Link href="/goals" className="text-xs font-medium" style={{ color: hc?.ring || '#fbbf24' }}>
            {hs?.label || 'Loading…'}
          </Link>
        </div>

        {/* Weekly goal */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <p className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>Weekly Goal</p>
          {dashStats ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold" style={{ color: '#FFFFFF' }}>{dashStats.goal.this_week}</span>
                <span className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>/ {dashStats.goal.target}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${dashStats.goal.pct}%`,
                    background: dashStats.goal.pct >= 100 ? 'linear-gradient(90deg, #4ade80, #22d3ee)' : 'linear-gradient(90deg, #A855F7, #DDD6FE)',
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">🔥</span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{dashStats.goal.streak_weeks} week streak</span>
              </div>
            </>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.32)' }} className="text-xs">Loading…</div>
          )}
        </div>

        {/* Pipeline counts */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>Pipeline</p>
            <Link href="/applications" className="text-xs" style={{ color: '#A855F7' }}>View all →</Link>
          </div>
          <div className="flex flex-col gap-2">
            {PIPELINE_LABELS.map(pl => {
              const cnt = dashStats?.pipeline_counts?.[pl.key as keyof typeof dashStats.pipeline_counts] ?? 0;
              const max = Math.max(...Object.values(dashStats?.pipeline_counts || {}), 1);
              return (
                <div key={pl.key} className="flex items-center gap-2">
                  <span className="text-xs w-14 shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>{pl.label}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.22)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round((cnt / max) * 100)}%`, background: pl.color }} />
                  </div>
                  <span className="text-xs w-6 text-right shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Due reminders */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>Due Reminders</p>
            {dashStats?.due_reminders?.length ? (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {dashStats.due_reminders.length}
              </span>
            ) : null}
          </div>
          {dashStats?.due_reminders?.length ? (
            <div className="flex flex-col gap-2">
              {dashStats.due_reminders.slice(0, 4).map(r => (
                <div key={r.id} className="text-xs rounded-lg px-2.5 py-2" style={{ background: 'rgba(0,0,0,0.22)' }}>
                  <p className="truncate font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>{r.title}</p>
                  <p className="truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{r.company_name}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>No overdue reminders</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {dashStats?.recent_activity?.length ? (
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>Recent Activity</p>
          <div className="flex flex-col gap-2">
            {dashStats.recent_activity.slice(0, 6).map((a, i) => (
              <Link
                key={i}
                href={`/applications/${a.application_id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(0,0,0,0.22)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#A855F7' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
                    {a.company_name} — {a.job_title}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{a.description}</p>
                </div>
                <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }}>
                  {new Date(a.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Portfolio quick-nav cards */}
      <div>
        <p className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>Portfolio</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
          {CARDS.map(c => {
            const rawVal = c.key ? portfolioStats[c.key] : null;
            const value  = rawVal !== null && rawVal !== undefined ? rawVal : null;
            const hasBadge = (c as { badge?: (s: PortfolioStats) => boolean }).badge?.(portfolioStats) ?? false;

            return (
              <Link
                key={c.label}
                href={c.href}
                className="group block rounded-2xl p-4 transition-all duration-150"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.border = `1px solid ${c.from}40`;
                  el.style.boxShadow = `0 8px 24px ${c.shadow}`;
                  el.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.border = '1px solid rgba(255,255,255,0.08)';
                  el.style.boxShadow = 'none';
                  el.style.transform = 'translateY(0)';
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c.from}25, ${c.to}35)`, border: `1px solid ${c.from}30` }}
                  >
                    <c.Icon width={16} height={16} style={{ color: c.from }} />
                  </div>
                  {value !== null ? (
                    <div className="flex items-center gap-1.5">
                      {hasBadge && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                      <span className="text-2xl font-bold" style={{
                        background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      }}>
                        {loading ? '…' : value}
                      </span>
                    </div>
                  ) : (
                    <IconArrow width={14} height={14} style={{ color: c.from, opacity: 0.5 }} />
                  )}
                </div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'rgba(255,255,255,0.92)' }}>{c.label}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{loading ? '…' : c.desc(portfolioStats)}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
