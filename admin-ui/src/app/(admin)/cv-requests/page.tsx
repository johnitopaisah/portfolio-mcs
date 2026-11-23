'use client';
// CV Requests — who received your CV (emailed from the public site), from
// where, and how. Charts are plain SVG/CSS (no chart library); colours come
// from --viz-1 / --viz-2 (validated for both themes in globals.css).
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { confirmDialog, showError } from '@/lib/dialog';

type Range = '7d' | '30d' | '90d' | '365d';
interface Bucket { label: string; n: number; code?: string }
interface Stats {
  totals: { sent: number; failed: number; unique_people: number; en: number; fr: number; from_pipeline: number; contacted: number; last_7d: number; prev_7d: number };
  daily: { day: string; en: number; fr: number }[];
  countries: Bucket[]; regions: Bucket[]; cities: Bucket[]; roles: Bucket[]; devices: Bucket[]; browsers: Bucket[];
  sources: Bucket[]; referrers: Bucket[]; companies: Bucket[]; hours: { hour: number; n: number }[];
}
interface Req {
  id: number; email: string | null; name: string | null; company: string | null; requester_role: string | null;
  language: 'en' | 'fr'; source: string | null; status: 'sent' | 'failed'; error: string | null;
  country: string | null; country_code: string | null; region: string | null; city: string | null;
  device: string | null; browser: string | null; os: string | null; referrer: string | null;
  matched_application_id: number | null; matched_company: string | null;
  contacted_at: string | null; notes: string | null; anonymised_at: string | null; created_at: string;
}

const RANGES: { v: Range; l: string }[] = [{ v: '7d', l: '7 days' }, { v: '30d', l: '30 days' }, { v: '90d', l: '90 days' }, { v: '365d', l: '12 months' }];
const ROLE: Record<string, string> = { recruiter: 'Recruiter', hiring_manager: 'Hiring manager', other: 'Other', Unknown: 'Not given' };
const SOURCE: Record<string, string> = { hero: 'Hero “Get my CV”', navbar: 'Top bar “Resume”', 'mobile-menu': 'Mobile menu', blog: 'Blog', other: 'Other', Unknown: 'Unknown' };
const flag = (cc?: string | null) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...Array.from(cc).map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '');
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const card = { background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' };
const ink1 = { color: 'var(--text-1)' }, ink2 = { color: 'var(--text-2)' }, ink3 = { color: 'var(--text-3)' };

// ── small pieces ────────────────────────────────────────────────
function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={card}>
      <p className="text-xs font-medium" style={ink2}>{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums" style={ink1}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={ink3}>{sub}</p>}
    </div>
  );
}

/** Ranked horizontal bars — one series, one hue; value in text ink. */
function BarList({ title, items, render = (b: Bucket) => b.label, empty = 'No data yet' }:
  { title: string; items: Bucket[]; render?: (b: Bucket) => React.ReactNode; empty?: string }) {
  const max = Math.max(1, ...items.map(i => i.n));
  return (
    <section className="rounded-2xl p-5" style={card} aria-label={title}>
      <h2 className="text-sm font-semibold mb-3" style={ink1}>{title}</h2>
      {!items.length ? <p className="text-xs" style={ink3}>{empty}</p> : (
        <ul className="flex flex-col gap-2.5">
          {items.map(b => (
            <li key={b.label} title={`${b.label}: ${b.n}`}>
              <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
                <span className="truncate" style={ink2}>{render(b)}</span>
                <span className="tabular-nums font-semibold" style={ink1}>{b.n}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--viz-track)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, (b.n / max) * 100)}%`, background: 'var(--viz-1)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Requests over time: stacked columns EN / FR, hover tooltip, table view. */
function Timeline({ daily, range }: { daily: Stats['daily']; range: Range }) {
  const [hover, setHover] = useState<number | null>(null);
  // > 90 days: weekly buckets so bars stay readable
  const data = useMemo(() => {
    if (range !== '365d') return daily.map(d => ({ label: fmtDay(d.day), en: d.en, fr: d.fr }));
    const out: { label: string; en: number; fr: number }[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const w = daily.slice(i, i + 7);
      out.push({ label: `Week of ${fmtDay(w[0].day)}`, en: w.reduce((s, d) => s + d.en, 0), fr: w.reduce((s, d) => s + d.fr, 0) });
    }
    return out;
  }, [daily, range]);
  const max = Math.max(1, ...data.map(d => d.en + d.fr));
  const W = 1000, H = 180, gap = data.length > 60 ? 1 : 2, bw = W / data.length - gap;
  const yTicks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  const h = hover !== null ? data[hover] : null;

  return (
    <section className="rounded-2xl p-5" style={card} aria-label="CV requests over time">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold" style={ink1}>CV requests over time {range === '365d' ? '(per week)' : '(per day)'}</h2>
        <div className="flex items-center gap-4 text-xs" style={ink2} aria-label="Legend">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--viz-1)' }} />English</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--viz-2)' }} />French</span>
        </div>
      </div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-48" preserveAspectRatio="none" role="img"
          aria-label={`${data.reduce((s, d) => s + d.en + d.fr, 0)} CV requests in the period`}>
          {yTicks.map(t => (
            <line key={t} x1="0" x2={W} y1={H - (t / max) * H} y2={H - (t / max) * H} stroke="var(--viz-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((d, i) => {
            const x = i * (bw + gap), en = (d.en / max) * H, fr = (d.fr / max) * H;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
                <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
                {d.en > 0 && <rect x={x} y={H - en} width={bw} height={en} rx={Math.min(3, bw / 2)} fill="var(--viz-1)" opacity={hover === null || hover === i ? 1 : 0.45} />}
                {d.fr > 0 && <rect x={x} y={H - en - fr - (d.en > 0 ? 2 : 0)} width={bw} height={fr} rx={Math.min(3, bw / 2)} fill="var(--viz-2)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-[11px] mt-1" style={ink3} aria-hidden="true">
          <span>{data[0]?.label}</span><span>{data[Math.floor(data.length / 2)]?.label}</span><span>{data[data.length - 1]?.label}</span>
        </div>
        <span className="absolute top-0 left-0 text-[11px] -translate-y-1" style={ink3} aria-hidden="true">{max}</span>
        {h && hover !== null && (
          <div role="status" className="absolute pointer-events-none rounded-lg px-3 py-2 text-xs shadow-lg z-10 whitespace-nowrap"
            style={{ left: `min(calc(${((hover + 0.5) / data.length) * 100}% + 8px), calc(100% - 150px))`, top: 8, background: 'var(--c-15-6-39-0_82)', border: '1px solid var(--c-255-255-255-0_12)', color: 'var(--text-1)' }}>
            <p className="font-semibold mb-1">{h.label}</p>
            <p><span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: 'var(--viz-1)' }} />English <b className="tabular-nums">{h.en}</b></p>
            <p><span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ background: 'var(--viz-2)' }} />French <b className="tabular-nums">{h.fr}</b></p>
          </div>
        )}
      </div>
      <details className="mt-3">
        <summary className="text-xs cursor-pointer" style={ink3}>Show as table</summary>
        <div className="max-h-48 overflow-auto mt-2">
          <table className="w-full text-xs">
            <thead><tr style={ink3}><th className="text-left font-medium py-1">Period</th><th className="text-right font-medium">English</th><th className="text-right font-medium">French</th></tr></thead>
            <tbody>{data.filter(d => d.en + d.fr > 0).map(d => (
              <tr key={d.label} style={ink2}><td className="py-0.5">{d.label}</td><td className="text-right tabular-nums">{d.en}</td><td className="text-right tabular-nums">{d.fr}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Hours({ hours }: { hours: Stats['hours'] }) {
  const byHour = Array.from({ length: 24 }, (_, h) => hours.find(x => x.hour === h)?.n || 0);
  const max = Math.max(1, ...byHour);
  return (
    <section className="rounded-2xl p-5" style={card} aria-label="Time of day (Paris)">
      <h2 className="text-sm font-semibold mb-3" style={ink1}>Time of day <span className="font-normal" style={ink3}>(Paris)</span></h2>
      <div className="flex items-end gap-[2px] h-24">
        {byHour.map((n, h) => (
          <div key={h} className="flex-1 h-full flex items-end" title={`${String(h).padStart(2, '0')}:00 — ${n}`}>
            <div className="w-full rounded-t-[3px]" style={{ height: n ? `${Math.max(6, (n / max) * 100)}%` : 2, background: n ? 'var(--viz-1)' : 'var(--viz-track)' }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] mt-1" style={ink3}><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </section>
  );
}

// ── page ────────────────────────────────────────────────────────
export default function CvRequestsPage() {
  const [range, setRange] = useState<Range>('90d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([adminApi.getCvRequestStats(range), adminApi.getCvRequests(range)]);
      setStats(s as Stats); setRows(r as Req[]);
    } catch (err) { showError(err, "Couldn't load CV requests."); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  // Optimistic: the box ticks at once; reverted if the save fails.
  async function toggleContacted(r: Req) {
    const prev = r.contacted_at;
    const next = prev ? null : new Date().toISOString();
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, contacted_at: next } : x));
    setBusy(r.id);
    try {
      const u = await adminApi.updateCvRequest(r.id, { contacted: !prev }) as { contacted_at: string | null };
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, contacted_at: u.contacted_at } : x));
    } catch (err) {
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, contacted_at: prev } : x));
      showError(err, "Couldn't save — please try again.");
    } finally { setBusy(null); }
  }
  async function saveNote(r: Req, notes: string) {
    if ((r.notes || '') === notes) return;
    try {
      await adminApi.updateCvRequest(r.id, { notes });
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, notes } : x));
    } catch (err) { showError(err, "Couldn't save the note."); }
  }
  async function remove(r: Req) {
    const ok = await confirmDialog({ title: 'Delete this person’s data?', message: `Every CV request from ${r.email || 'this person'} is deleted permanently (use this when someone asks to be removed).`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await adminApi.deleteCvRequest(r.id); await load(); } catch (err) { showError(err); }
  }
  async function download(lang: 'en' | 'fr') {
    try { await adminApi.downloadMyCv(lang); } catch (err) { showError(err); }
  }

  const t = stats?.totals;
  const delta = t ? t.last_7d - t.prev_7d : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={ink1}>CV Requests</h1>
          <p className="text-sm mt-1" style={ink3}>Visitors get your CV by email — here is who, from where and how.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={ink3}>Your copy:</span>
          <button onClick={() => download('en')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ ...ink2, border: '1px solid var(--border-2)' }}>EN PDF ↓</button>
          <button onClick={() => download('fr')} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ ...ink2, border: '1px solid var(--border-2)' }}>FR PDF ↓</button>
        </div>
      </div>

      {/* filter row */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--c-0-0-0-0_22)' }} role="tablist" aria-label="Time range">
        {RANGES.map(r => (
          <button key={r.v} role="tab" aria-selected={range === r.v} onClick={() => setRange(r.v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={range === r.v ? { background: 'var(--c-168-85-247-0_25)', color: 'var(--text-1)' } : ink2}>{r.l}</button>
        ))}
      </div>

      {loading && !stats ? <p className="text-sm py-10 text-center" style={ink3}>Loading…</p> : stats && t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile label="CVs sent" value={t.sent} sub={t.failed ? `${t.failed} failed to send` : 'in this period'} />
            <Tile label="People" value={t.unique_people} sub="unique emails" />
            <Tile label="English / French" value={<>{t.en}<span className="text-base font-medium" style={ink3}> / </span>{t.fr}</>}
              sub={t.sent ? `${Math.round((t.fr / t.sent) * 100)}% French` : '—'} />
            <Tile label="Last 7 days" value={t.last_7d} sub={`${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)} vs previous 7`} />
            <Tile label="From your pipeline" value={t.from_pipeline} sub="companies you applied to" />
            <Tile label="Contacted" value={t.contacted} sub={t.sent ? `${Math.round((t.contacted / t.sent) * 100)}% followed up` : '—'} />
          </div>

          <Timeline daily={stats.daily} range={range} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BarList title="Countries" items={stats.countries} render={b => <>{flag(b.code)} {b.label}</>} />
            <BarList title="Regions" items={stats.regions} />
            <BarList title="Cities" items={stats.cities} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BarList title="Who (role)" items={stats.roles} render={b => ROLE[b.label] || b.label} />
            <BarList title="Companies / email domains" items={stats.companies} />
            <Hours hours={stats.hours} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BarList title="Button used" items={stats.sources} render={b => SOURCE[b.label] || b.label} />
            <BarList title="Came from" items={stats.referrers} />
            <BarList title="Device" items={[...stats.devices]} render={b => b.label} />
          </div>

          {/* requests */}
          <section className="rounded-2xl p-5" style={card} aria-label="Requests">
            <h2 className="text-sm font-semibold mb-3" style={ink1}>Requests <span className="font-normal" style={ink3}>({rows.length})</span></h2>
            {!rows.length ? <p className="text-xs" style={ink3}>No CV requests in this period yet.</p> : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs min-w-[860px]">
                  <thead>
                    <tr className="text-left" style={ink3}>
                      {['When', 'Who', 'Lang', 'Where', 'Device', 'Pipeline', 'Contacted', 'Note', ''].map(h => <th key={h} className="font-medium px-2 py-2">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="align-top" style={{ borderTop: '1px solid var(--c-255-255-255-0_06)' }}>
                        <td className="px-2 py-2.5 whitespace-nowrap" style={ink2}>
                          {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {r.status === 'failed' && <span className="block" style={{ color: 'var(--t-f87171)' }} title={r.error || ''}>not delivered</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.email ? <a href={`mailto:${r.email}`} className="font-medium hover:underline" style={ink1}>{r.email}</a> : <span style={ink3}>anonymised</span>}
                          {(r.name || r.company || r.requester_role) && (
                            <span className="block" style={ink3}>{[r.name, r.company, r.requester_role && ROLE[r.requester_role]].filter(Boolean).join(' · ')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 font-semibold" style={ink2}>{r.language.toUpperCase()}</td>
                        <td className="px-2 py-2.5" style={ink2}>{flag(r.country_code)} {[r.city, r.region, r.country].filter(Boolean).join(', ') || '—'}</td>
                        <td className="px-2 py-2.5" style={ink2}>{[r.device, r.browser, r.os].filter(Boolean).join(' · ') || '—'}<span className="block" style={ink3}>{SOURCE[r.source || 'Unknown'] || r.source}{r.referrer ? ` · via ${r.referrer}` : ''}</span></td>
                        <td className="px-2 py-2.5">{r.matched_application_id
                          ? <Link href={`/applications/${r.matched_application_id}`} className="hover:underline" style={{ color: 'var(--t-a78bfa)' }}>⭐ {r.matched_company}</Link>
                          : <span style={ink3}>—</span>}</td>
                        <td className="px-2 py-2.5">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer" style={ink2}>
                            <input type="checkbox" checked={!!r.contacted_at} disabled={busy === r.id || !r.email} onChange={() => toggleContacted(r)} className="accent-violet-600" />
                            {r.contacted_at ? new Date(r.contacted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No'}
                          </label>
                        </td>
                        <td className="px-2 py-2.5 min-w-[160px]">
                          <input defaultValue={r.notes || ''} onBlur={e => saveNote(r, e.target.value)} placeholder="Add a note"
                            aria-label={`Note for ${r.email || 'request'}`} maxLength={2000}
                            className="w-full bg-transparent outline-none rounded px-1 py-0.5 text-xs" style={{ ...ink2, border: '1px solid var(--c-255-255-255-0_08)' }} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button onClick={() => remove(r)} className="hover:underline" style={{ color: 'var(--t-f87171)' }} aria-label={`Delete data for ${r.email || 'this request'}`}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] mt-3" style={ink3}>Name, company and role are deleted after 90 days; the email after 12 months (then only country, language and date remain).</p>
          </section>
        </>
      )}
    </div>
  );
}
