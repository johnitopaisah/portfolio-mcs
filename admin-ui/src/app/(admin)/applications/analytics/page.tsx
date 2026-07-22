'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';

interface FunnelRow { status: string; count: string; avg_score: string | null; }
interface PlatformRow { platform: string; total: string; responded: string; avg_score: string | null; }
interface Timings {
  avg_days_to_response: string | null;
  avg_age_days: string | null;
  applied_count: string;
  response_count: string;
}

interface Analytics {
  by_status:   FunnelRow[];
  by_platform: PlatformRow[];
  timings:     Timings;
}

// Status display order and grouping
const STATUS_META: Record<string, { label: string; group: 'prep' | 'active' | 'interview' | 'outcome' | 'closed' }> = {
  DRAFT:               { label: 'Draft',              group: 'prep' },
  CV_GENERATED:        { label: 'CV Ready',           group: 'prep' },
  READY_TO_APPLY:      { label: 'Ready to Apply',     group: 'prep' },
  APPLIED:             { label: 'Applied',             group: 'active' },
  EMAIL_RECEIVED:      { label: 'Email Received',      group: 'active' },
  HR_CONTACTED:        { label: 'HR Contacted',        group: 'active' },
  INTERVIEW_INVITE:    { label: 'Interview Invite',    group: 'interview' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', group: 'interview' },
  TECHNICAL_TEST:      { label: 'Technical Test',      group: 'interview' },
  FINAL_INTERVIEW:     { label: 'Final Interview',     group: 'interview' },
  OFFER:               { label: 'Offer',               group: 'outcome' },
  NEGOTIATING:         { label: 'Negotiating',         group: 'outcome' },
  ACCEPTED:            { label: 'Accepted',            group: 'outcome' },
  DECLINED_OFFER:      { label: 'Declined Offer',      group: 'outcome' },
  REJECTED:            { label: 'Rejected',            group: 'closed' },
  NO_RESPONSE:         { label: 'No Response',         group: 'closed' },
  WITHDRAWN:           { label: 'Withdrawn',           group: 'closed' },
  GHOSTED:             { label: 'Ghosted',             group: 'closed' },
  ARCHIVED:            { label: 'Archived',            group: 'closed' },
};

function groupColor(group: string) {
  switch (group) {
    case 'prep':      return { bar: 'bg-gray-600', badge: 'bg-gray-800 text-gray-400' };
    case 'active':    return { bar: 'bg-blue-600',  badge: 'bg-blue-900/50 text-blue-300' };
    case 'interview': return { bar: 'bg-orange-500', badge: 'bg-orange-900/50 text-orange-300' };
    case 'outcome':   return { bar: 'bg-green-600',  badge: 'bg-green-900/50 text-green-300' };
    case 'closed':    return { bar: 'bg-red-700',    badge: 'bg-red-900/40 text-red-400' };
    default:          return { bar: 'bg-gray-600',   badge: 'bg-gray-800 text-gray-400' };
  }
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

export default function ApplicationAnalyticsPage() {
  const [data,    setData]    = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    adminApi.getApplicationAnalytics()
      .then(d => setData(d as Analytics))
      .catch(err => setError((err as Error).message || 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-800 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><div key={i} className="h-24 bg-gray-900 rounded-xl border border-gray-800"/>)}</div>
      <div className="h-64 bg-gray-900 rounded-xl border border-gray-800"/>
    </div>
  );

  if (error) return (
    <div className="text-red-400 text-sm p-4 bg-red-900/20 rounded-xl border border-red-800/40">{error}</div>
  );

  if (!data) return null;

  const totalApps = data.by_status.reduce((s, r) => s + parseInt(r.count), 0);
  const appliedRow = data.by_status.find(r => r.status === 'APPLIED');
  const appliedCount = parseInt(appliedRow?.count || '0');
  const interviewCount = data.by_status
    .filter(r => ['INTERVIEW_INVITE','INTERVIEW_SCHEDULED','TECHNICAL_TEST','FINAL_INTERVIEW'].includes(r.status))
    .reduce((s, r) => s + parseInt(r.count), 0);
  const offerCount = data.by_status
    .filter(r => ['OFFER','NEGOTIATING','ACCEPTED'].includes(r.status))
    .reduce((s, r) => s + parseInt(r.count), 0);
  const responseRate = parseInt(data.timings.applied_count || '0') > 0
    ? Math.round((parseInt(data.timings.response_count || '0') / parseInt(data.timings.applied_count)) * 100)
    : 0;

  const maxCount = Math.max(...data.by_status.map(r => parseInt(r.count)), 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/applications" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Applications</Link>
          <h1 className="text-xl font-bold text-white mt-1">Application Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">{totalApps} total applications</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Applications" value={totalApps} />
        <MetricCard label="Response Rate" value={`${responseRate}%`}
          sub={`${data.timings.response_count || 0} of ${data.timings.applied_count || 0} applied`}
        />
        <MetricCard label="Avg Days to Response"
          value={data.timings.avg_days_to_response ? `${data.timings.avg_days_to_response}d` : '—'}
          sub="from applied to first response"
        />
        <MetricCard label="Interviews / Offers"
          value={`${interviewCount} / ${offerCount}`}
          sub="in progress or completed"
        />
      </div>

      {/* Funnel grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Status breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Applications by Status</h2>
          <div className="space-y-2">
            {data.by_status.map(row => {
              const meta  = STATUS_META[row.status];
              const group = meta?.group || 'closed';
              const colors = groupColor(group);
              const count = parseInt(row.count);
              const pct = Math.round((count / maxCount) * 100);
              return (
                <div key={row.status} className="flex items-center gap-3">
                  <div className="w-32 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                      {meta?.label || row.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-8 text-right text-sm font-bold text-white">{count}</div>
                  {row.avg_score && (
                    <div className="w-12 text-right text-xs text-gray-500">{row.avg_score}%</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* By platform */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">By Source Platform</h2>
          <div className="space-y-3">
            {data.by_platform.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No data yet.</p>
            ) : (
              data.by_platform.map(row => {
                const total     = parseInt(row.total);
                const responded = parseInt(row.responded);
                const rate      = total > 0 ? Math.round((responded / total) * 100) : 0;
                return (
                  <div key={row.platform} className="flex items-center gap-3">
                    <div className="w-36 flex-shrink-0">
                      <span className="text-xs text-gray-400 capitalize font-medium">
                        {row.platform.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">{responded}/{total} responded</span>
                        <span className={`text-xs font-bold ${rate >= 50 ? 'text-green-400' : rate >= 25 ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {rate}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rate >= 50 ? 'bg-green-600' : rate >= 25 ? 'bg-yellow-600' : 'bg-gray-600'}`}
                          style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                    <div className="w-6 text-right text-sm font-bold text-white">{total}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pipeline funnel visual */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5">Conversion Funnel</h2>
        <div className="flex items-end gap-3 overflow-x-auto pb-2">
          {[
            { label: 'Created',     count: totalApps,      color: 'bg-gray-700' },
            { label: 'Applied',     count: parseInt(data.timings.applied_count || '0'), color: 'bg-blue-700' },
            { label: 'Responded',   count: parseInt(data.timings.response_count || '0'), color: 'bg-yellow-600' },
            { label: 'Interviewed', count: interviewCount, color: 'bg-orange-600' },
            { label: 'Offered',     count: offerCount,     color: 'bg-green-600' },
          ].map((stage, i, arr) => {
            const maxH = 120;
            const h = totalApps > 0 ? Math.max(12, Math.round((stage.count / totalApps) * maxH)) : 12;
            const pct = i > 0 && parseInt(arr[i-1].count as unknown as string) > 0
              ? Math.round((stage.count / (arr[i-1].count as number)) * 100)
              : null;
            return (
              <div key={stage.label} className="flex flex-col items-center gap-2 flex-shrink-0 w-24">
                <div className="text-xl font-black text-white">{stage.count}</div>
                <div className={`w-full rounded-lg ${stage.color} transition-all`} style={{ height: `${h}px` }} />
                <div className="text-xs text-gray-500 text-center">{stage.label}</div>
                {pct !== null && (
                  <div className="text-xs text-gray-600">↓ {pct}%</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
