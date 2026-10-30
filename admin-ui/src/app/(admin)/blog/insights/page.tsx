'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Row { label: string; clicks: number }
interface DayPoint { day: string; clicks: number; uniques: number }
interface TopPost { id: string; title: string; clicks: number; uniques: number }
interface RecentClick {
  id: number;
  clicked_at: string;
  title: string;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  language: string | null;
  source_page: string | null;
  traffic_source: string | null;
}
interface Insights {
  range: string;
  retention_days: number;
  totals: { clicks: number; uniques: number };
  timeline: DayPoint[];
  top_posts: TopPost[];
  recent: RecentClick[];
  countries: Row[];
  cities: Row[];
  devices: Row[];
  operating_systems: Row[];
  browsers: Row[];
  traffic_sources: Row[];
  source_pages: Row[];
}

const RANGES = [
  { value: '7',   label: '7d' },
  { value: '30',  label: '30d' },
  { value: '90',  label: '90d' },
  { value: 'all', label: 'All' },
];

const BAR_COLOR = '#A855F7';
const PANEL = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' };

const PAGE_LABELS: Record<string, string> = { home: 'Homepage', blog: 'Blog page', other: 'Other' };

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

// ── Pieces ────────────────────────────────────────────────────────────────────
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-5" style={PANEL}>
      <p className="text-xs font-semibold" style={{ color: '#DDD6FE' }}>{label}</p>
      <p className="text-3xl font-bold mt-2 truncate" style={{ color: '#FFFFFF' }}>{value}</p>
      {hint && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{hint}</p>}
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 min-w-0 ${className}`} style={PANEL}>
      <p className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>{title}</p>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>No data yet</p>;
}

function RankedBars({ rows, format = capitalize }: { rows: Row[]; format?: (label: string) => string }) {
  if (!rows.length) return <Empty />;
  const max   = Math.max(...rows.map(r => r.clicks), 1);
  const total = rows.reduce((sum, r) => sum + r.clicks, 0);
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => (
        <div key={r.label} title={`${format(r.label)}: ${r.clicks} click${r.clicks === 1 ? '' : 's'} (${percent(r.clicks, total)}%)`}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>{format(r.label)}</span>
            <span className="shrink-0 tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{r.clicks}</span>
          </div>
          <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.22)' }}>
            <div className="h-full rounded-r" style={{ width: `${Math.max((r.clicks / max) * 100, 2)}%`, background: BAR_COLOR }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ points }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...points.map(p => p.clicks), 1);
  const active = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="relative">
        <div className="flex items-end h-36 border-b" style={{ borderColor: 'rgba(255,255,255,0.15)', gap: points.length > 60 ? 0 : 2 }}
          onMouseLeave={() => setHover(null)}>
          {points.map((p, i) => (
            // The full-height column is the hover target, wider than the mark inside it.
            <div key={p.day} className="flex-1 h-full flex items-end min-w-0" onMouseEnter={() => setHover(i)}
              style={{ background: hover === i ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
              {p.clicks > 0 && (
                <div className="w-full rounded-t" style={{ height: `${Math.max((p.clicks / max) * 100, 3)}%`, background: BAR_COLOR }} />
              )}
            </div>
          ))}
        </div>
        {active && hover !== null && (
          <div className="absolute top-0 z-10 px-2.5 py-1.5 rounded-lg text-xs pointer-events-none whitespace-nowrap"
            style={{
              background: 'rgba(20,10,45,0.97)', border: '1px solid rgba(255,255,255,0.15)', color: '#FFFFFF',
              ...(hover > points.length / 2
                ? { right: `${((points.length - hover) / points.length) * 100}%` }
                : { left: `${((hover + 1) / points.length) * 100}%` }),
            }}>
            <p className="font-semibold">{formatDay(active.day)}</p>
            <p style={{ color: 'rgba(255,255,255,0.75)' }}>{active.clicks} clicks · {active.uniques} unique</p>
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
        <span>{points.length ? formatDay(points[0].day) : ''}</span>
        <span>Today (UTC)</span>
      </div>
    </div>
  );
}

function location(c: RecentClick) {
  return [c.city, c.country_code || c.country].filter(Boolean).join(', ') || c.country || 'Unknown';
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BlogInsightsPage() {
  return (
    <Suspense>
      <BlogInsightsInner />
    </Suspense>
  );
}

function BlogInsightsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postFilter = searchParams.get('post') || '';
  const requestedRange = searchParams.get('range') || '30';
  const range = RANGES.some(r => r.value === requestedRange) ? requestedRange : '30';

  const [data,    setData]    = useState<Insights | null>(null);
  const [posts,   setPosts]   = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    adminApi.getBlogPosts().then(setPosts).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi.getBlogInsights(range, postFilter || undefined)
      .then((d: Insights) => { if (!cancelled) setData(d); })
      .catch((err: Error) => { if (!cancelled) setError(err.message || 'Failed to load insights'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, postFilter]);

  function setFilter(next: { range?: string; post?: string }) {
    const params = new URLSearchParams();
    const r = next.range ?? range;
    const p = next.post ?? postFilter;
    if (r !== '30') params.set('range', r);
    if (p) params.set('post', p);
    const qs = params.toString();
    router.replace(qs ? `/blog/insights?${qs}` : '/blog/insights');
  }

  const totalDevices = data?.devices.reduce((sum, r) => sum + r.clicks, 0) ?? 0;
  const totalCountry = data?.countries.reduce((sum, r) => sum + r.clicks, 0) ?? 0;
  const topCountry   = data?.countries[0];
  const topDevice    = data?.devices[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/blog" className="text-xs hover:underline" style={{ color: '#A855F7' }}>← Blog</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ color: '#FFFFFF' }}>Blog Insights</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Readers who clicked through to Medium from your site.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.22)' }}>
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setFilter({ range: r.value })} aria-pressed={range === r.value}
                className="px-3 py-1.5 text-xs rounded-md font-medium transition-colors"
                style={range === r.value
                  ? { background: '#7C3AED', color: '#FFFFFF' }
                  : { color: 'rgba(255,255,255,0.65)' }}>
                {r.label}
              </button>
            ))}
          </div>
          <select value={postFilter} onChange={e => setFilter({ post: e.target.value })} aria-label="Filter by post"
            className="text-xs rounded-lg px-3 py-2 max-w-[16rem] focus:outline-none"
            style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
            <option value="" style={{ color: '#111' }}>All posts</option>
            {posts.map(p => <option key={p.id} value={p.id} style={{ color: '#111' }}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{error}</div>
      )}

      {!data && loading && <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading…</p>}

      {data && (
        <div className="space-y-6" style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile label="Clicks" value={String(data.totals.clicks)} />
            <StatTile label="Unique visitors" value={String(data.totals.uniques)} hint="Counted per day" />
            <StatTile label="Top country" value={topCountry?.label || '—'}
              hint={topCountry ? `${percent(topCountry.clicks, totalCountry)}% of clicks` : undefined} />
            <StatTile label="Top device" value={topDevice ? capitalize(topDevice.label) : '—'}
              hint={topDevice ? `${percent(topDevice.clicks, totalDevices)}% of clicks` : undefined} />
          </div>

          <Panel title="Clicks over time">
            <Timeline points={data.timeline} />
          </Panel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Top posts">
              {data.top_posts.length ? (
                <div className="flex flex-col gap-2.5">
                  {data.top_posts.map(p => (
                    <button key={p.id} onClick={() => setFilter({ post: p.id })} className="block w-full text-left rounded hover:bg-white/5"
                      title={`${p.title}: ${p.clicks} clicks, ${p.uniques} unique. Click to filter.`}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>{p.title}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{p.clicks}</span>
                      </div>
                      <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.22)' }}>
                        <div className="h-full rounded-r" style={{ width: `${Math.max((p.clicks / data.top_posts[0].clicks) * 100, 2)}%`, background: BAR_COLOR }} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : <Empty />}
            </Panel>
            <Panel title="Countries"><RankedBars rows={data.countries} format={l => l} /></Panel>
            <Panel title="Cities"><RankedBars rows={data.cities} format={l => l} /></Panel>
            <Panel title="Devices"><RankedBars rows={data.devices} /></Panel>
            <Panel title="Operating systems"><RankedBars rows={data.operating_systems} format={l => l} /></Panel>
            <Panel title="Browsers"><RankedBars rows={data.browsers} format={l => l} /></Panel>
            <Panel title="Traffic sources"><RankedBars rows={data.traffic_sources} format={l => l} /></Panel>
            <Panel title="Clicked from"><RankedBars rows={data.source_pages} format={l => PAGE_LABELS[l] || l} /></Panel>
          </div>

          <Panel title="Recent clicks">
            {data.recent.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {['Time', 'Post', 'Location', 'Device', 'OS / Browser', 'Language', 'Source'].map(h => (
                        <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map(c => (
                      <tr key={c.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)' }}>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {new Date(c.clicked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 pr-4 max-w-[16rem] truncate" title={c.title}>{c.title}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{location(c)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{capitalize(c.device_type || 'Unknown')}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{c.os || '—'} / {c.browser || '—'}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{c.language || '—'}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{c.traffic_source || 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty />}
          </Panel>

          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            A click means a reader went to Medium, not that they read the post. Location is approximate.
            A &quot;Unknown&quot; source means the visit didn&apos;t start on your homepage.
            {data.range === 'all' && ` Breakdowns and recent clicks cover the last ${data.retention_days} days; older clicks are kept as daily totals.`}
          </p>
        </div>
      )}
    </div>
  );
}
