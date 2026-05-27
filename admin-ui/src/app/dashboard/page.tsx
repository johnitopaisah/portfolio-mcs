'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import {
  IconFolder, IconZap, IconBriefcase, IconAward,
  IconMessage, IconUser, IconCpu, IconLayers, IconArrow,
} from '@/components/Icons';

type AvailStatus = 'active' | 'passive' | 'not_open';

const AVAIL_OPTIONS: { value: AvailStatus; label: string; dot: string }[] = [
  { value: 'active',   label: 'Available',     dot: '#22c55e' },
  { value: 'passive',  label: 'Open to right', dot: '#f59e0b' },
  { value: 'not_open', label: 'Not open',      dot: '#6b7280' },
];

function AvailabilityWidget() {
  const [current, setCurrent] = useState<AvailStatus | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    adminApi.getProfile()
      .then((p: any) => setCurrent(p?.availability_status ?? 'active'))
      .catch(() => setError('Could not load — is the DB migration applied?'));
  }, []);

  async function select(val: AvailStatus) {
    if (val === current || saving) return;
    const prev = current;
    setCurrent(val);   // optimistic — UI responds instantly
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.setAvailabilityStatus(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setCurrent(prev); // revert on failure
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-1)' }}>
            Portfolio Availability
          </p>
          <p className="text-xs" style={{ color: 'var(--text-2)' }}>
            Availability signal shown to recruiters
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {AVAIL_OPTIONS.map(opt => {
            const isSelected = current === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => select(opt.value)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: isSelected ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  border:     isSelected ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color:      isSelected ? '#22c55e' : 'var(--text-3)',
                  cursor:     saving ? 'not-allowed' : 'pointer',
                  opacity:    saving && !isSelected ? 0.5 : 1,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isSelected ? opt.dot : 'rgba(255,255,255,0.2)',
                    boxShadow:  isSelected ? `0 0 5px ${opt.dot}` : 'none',
                  }} />
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 min-w-[64px] text-right">
          {saving && <span className="text-xs" style={{ color: 'var(--text-3)' }}>Saving…</span>}
          {!saving && saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓ Saved</span>}
          {!saving && !saved && error && <span className="text-xs" style={{ color: '#ef4444' }} title={error}>⚠ Error</span>}
        </div>
      </div>
    </div>
  );
}

interface Stats {
  projects: number;
  skills: number;
  experiences: number;
  certifications: number;
  unread: number;
  aiTotal: string;
  aiKept: string;
  aiReview: string;
  jobsNew: string;
  jobsSaved: string;
  jobsApplied: string;
}

const CARDS = [
  {
    label:    'Projects',
    key:      'projects' as keyof Stats,
    href:     '/dashboard/projects',
    from:     '#7c3aed',
    to:       '#4f46e5',
    shadow:   'rgba(79,70,229,0.25)',
    Icon:     IconFolder,
    desc:     () => 'Portfolio items',
  },
  {
    label:    'Skills',
    key:      'skills' as keyof Stats,
    href:     '/dashboard/skills',
    from:     '#0ea5e9',
    to:       '#6366f1',
    shadow:   'rgba(14,165,233,0.2)',
    Icon:     IconZap,
    desc:     () => 'Technical stack',
  },
  {
    label:    'Experience',
    key:      'experiences' as keyof Stats,
    href:     '/dashboard/experience',
    from:     '#f59e0b',
    to:       '#ef4444',
    shadow:   'rgba(245,158,11,0.2)',
    Icon:     IconBriefcase,
    desc:     () => 'Work history',
  },
  {
    label:    'Certifications',
    key:      'certifications' as keyof Stats,
    href:     '/dashboard/certifications',
    from:     '#10b981',
    to:       '#0d9488',
    shadow:   'rgba(16,185,129,0.2)',
    Icon:     IconAward,
    desc:     () => 'Credentials & badges',
  },
  {
    label:    'Messages',
    key:      'unread' as keyof Stats,
    href:     '/dashboard/messages',
    from:     '#f43f5e',
    to:       '#ec4899',
    shadow:   'rgba(244,63,94,0.2)',
    Icon:     IconMessage,
    desc:     (s: Stats) => s.unread > 0 ? `${s.unread} unread` : 'All read',
    badge:    (s: Stats) => s.unread > 0,
  },
  {
    label:    'Profile',
    key:      null,
    href:     '/dashboard/profile',
    from:     '#a855f7',
    to:       '#d946ef',
    shadow:   'rgba(168,85,247,0.2)',
    Icon:     IconUser,
    desc:     () => 'Edit your profile',
  },
  {
    label:    'AI Engine',
    key:      'aiTotal' as keyof Stats,
    href:     '/dashboard/ai',
    from:     '#06b6d4',
    to:       '#3b82f6',
    shadow:   'rgba(6,182,212,0.2)',
    Icon:     IconCpu,
    desc:     (s: Stats) => `${s.aiKept} kept · ${s.aiReview} in review`,
  },
  {
    label:    'Job Pipeline',
    key:      'jobsNew' as keyof Stats,
    href:     '/dashboard/jobs',
    from:     '#22c55e',
    to:       '#10b981',
    shadow:   'rgba(34,197,94,0.2)',
    Icon:     IconLayers,
    desc:     (s: Stats) => `${s.jobsSaved} saved · ${s.jobsApplied} applied`,
  },
];

const EMPTY: Stats = {
  projects: 0, skills: 0, experiences: 0, certifications: 0, unread: 0,
  aiTotal: '—', aiKept: '—', aiReview: '—',
  jobsNew: '—', jobsSaved: '—', jobsApplied: '—',
};

export default function DashboardPage() {
  const [stats,   setStats]   = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      adminApi.getProjects(),
      adminApi.getSkills(),
      adminApi.getExperiences(),
      adminApi.getCertifications(),
      adminApi.getMessages(),
      adminApi.getAiStatus(),
      adminApi.getJobsProgress(),
    ]).then(([proj, skills, exp, certs, msgs, ai, jobs]) => {
      const p = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null;

      const aiStatus  = p(ai);
      const jobProg   = p(jobs);

      setStats({
        projects:       p(proj)?.length  ?? 0,
        skills:         p(skills)?.length ?? 0,
        experiences:    p(exp)?.length   ?? 0,
        certifications: p(certs)?.length ?? 0,
        unread:         p(msgs)?.filter((m: any) => !m.read).length ?? 0,
        aiTotal:        aiStatus?.last_24h?.total_jobs ?? '—',
        aiKept:         aiStatus?.last_24h?.kept       ?? '—',
        aiReview:       aiStatus?.last_24h?.review     ?? '—',
        jobsNew:        jobProg?.new_count     ?? '—',
        jobsSaved:      jobProg?.saved_count   ?? '—',
        jobsApplied:    jobProg?.applied_count ?? '—',
      });
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Overview of your portfolio content</p>
      </div>

      <AvailabilityWidget />

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map(c => {
          const rawVal = c.key ? stats[c.key] : null;
          const value  = rawVal !== null && rawVal !== undefined ? rawVal : null;
          const desc   = c.desc(stats);
          const hasBadge = (c as any).badge ? (c as any).badge(stats) : false;

          return (
            <Link key={c.label} href={c.href} className="group block rounded-2xl transition-all duration-200"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                padding: '1.25rem',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.border = `1px solid rgba(124,58,237,0.25)`;
                el.style.boxShadow = `0 8px 32px ${c.shadow}`;
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.border = '1px solid var(--border)';
                el.style.boxShadow = 'none';
                el.style.transform = 'translateY(0)';
              }}
            >
              {/* Top row: icon + value */}
              <div className="flex items-start justify-between mb-4">
                {/* Icon badge */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `linear-gradient(135deg, ${c.from}20, ${c.to}30)`, border: `1px solid ${c.from}30` }}>
                  <c.Icon width={18} height={18} style={{ color: c.from }} />
                </div>

                {/* Value */}
                {value !== null ? (
                  <div className="flex items-center gap-2">
                    {hasBadge && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    )}
                    <span className="text-2xl font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                      {loading ? '…' : value}
                    </span>
                  </div>
                ) : (
                  <IconArrow width={16} height={16} style={{ color: c.from }} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                )}
              </div>

              {/* Label + desc */}
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-1)' }}>{c.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>{loading ? '·  ·  ·' : desc}</p>

              {/* Bottom accent line */}
              <div className="mt-4 h-px rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, ${c.from}, ${c.to})` }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
