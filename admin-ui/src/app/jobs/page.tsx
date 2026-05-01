'use client';
/**
 * Admin Dashboard — Job Aggregation System
 *
 * Fixed:
 * 1. apiFetch: authHeader() typed as Record<string,string> — fixes TS build error.
 * 2. Feedback body: { action } not { decision }.
 * 3. Feedback values: 'skipped' not 'skip', 'saved' not 'interested'.
 * 4. Endpoints corrected: /admin/jobs/feedback, GET /admin/jobs/calibration.
 * 5. Interfaces match actual API field names (keep/review/drop, n/avg_ai_score).
 */

import React, { useState, useEffect, useCallback } from 'react';

const API = '/api';

// ── Types matching actual API responses ───────────────────────
interface Job {
  id: string; title: string; company_name: string; location: string;
  relevance_score: number; ai_decision: string; ai_reasoning: string;
  tech_stack: string[]; seniority_level: string; visa_sponsored: boolean | null;
  apply_url: string; posted_at: string; source_api: string;
}

// GET /api/jobs/stats
interface JobStats {
  keep: string;
  review: string;
  drop: string;
  last_24h: string;
  avg_score: string;
}

interface IngestionLog {
  id: string; source_api: string; status: string;
  jobs_fetched: number; jobs_new: number; jobs_duplicates: number;
  duration_ms: number; created_at: string;
}

// GET /api/jobs/admin/feedback  and  GET /api/admin/jobs/calibration
interface FeedbackRow {
  action: string;
  n: string;
  avg_ai_score: string;
  high_scored: string;
  low_scored: string;
  min_score?: string;
  max_score?: string;
}

type Tab = 'dashboard' | 'jobs' | 'logs' | 'calibration';

// ── Auth header — explicitly typed to avoid TS inference issues ──
function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token =
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Fetch helper — headers explicitly typed as Record<string,string> ──
async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  // Build headers as a plain object so TypeScript is happy.
  // Merging: defaults < authHeader < caller-supplied headers.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader(),
    ...(opts?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Score bar ─────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const colour = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: colour }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color: colour }}>{score}</span>
    </div>
  );
}

// ── Feedback buttons ──────────────────────────────────────────
// API accepts: 'applied' | 'saved' | 'skipped' | 'hidden'
function FeedbackButtons({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState<string | null>(null);

  async function record(action: 'saved' | 'applied' | 'skipped') {
    setBusy(true);
    try {
      await apiFetch(`/jobs/${jobId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ action }),   // API reads req.body.action
      });
      setDone(action);
      setTimeout(onDone, 600);
    } catch (e) {
      alert(`Feedback failed: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  if (done) return (
    <span className="text-xs font-semibold" style={{
      color: done === 'applied' ? '#22c55e' : done === 'saved' ? '#818cf8' : '#f87171',
    }}>
      {done === 'applied' ? '✓ Applied' : done === 'saved' ? '⭐ Saved' : '✗ Skipped'}
    </span>
  );

  return (
    <div className="flex gap-1">
      <button disabled={busy} onClick={() => record('saved')}
        className="text-xs px-2 py-1 rounded border transition-colors"
        style={{ borderColor: 'rgba(99,102,241,.4)', color: '#818cf8' }}
        title="Save for later">
        ⭐
      </button>
      <button disabled={busy} onClick={() => record('applied')}
        className="text-xs px-2 py-1 rounded border transition-colors"
        style={{ borderColor: 'rgba(34,197,94,.4)', color: '#22c55e' }}
        title="Mark as Applied">
        ✓ Apply
      </button>
      <button disabled={busy} onClick={() => record('skipped')}
        className="text-xs px-2 py-1 rounded border transition-colors"
        style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171' }}
        title="Skip this job">
        ✗ Skip
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function JobAdminDashboard() {
  const [tab, setTab] = useState<Tab>('dashboard');

  // Dashboard
  const [stats,    setStats]    = useState<JobStats | null>(null);
  const [logs,     setLogs]     = useState<IngestionLog[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loadingD, setLoadingD] = useState(true);

  // Jobs tab
  const [jobs,      setJobs]      = useState<Job[]>([]);
  const [jobPage,   setJobPage]   = useState(1);
  const [jobTotal,  setJobTotal]  = useState(0);
  const [loadingJ,  setLoadingJ]  = useState(false);
  const [minScore,  setMinScore]  = useState(60);
  const [decFilter, setDecFilter] = useState('KEEP,REVIEW');

  // Calibration
  const [calibRows, setCalibRows] = useState<FeedbackRow[]>([]);
  const [calibBusy, setCalibBusy] = useState(false);

  // Action states
  const [ingestBusy, setIngestBusy] = useState(false);
  const [filterBusy, setFilterBusy] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [actionMsg,  setActionMsg]  = useState('');

  // ── Load dashboard ──────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoadingD(true);
    try {
      const [s, logsRes, fb] = await Promise.all([
        apiFetch<JobStats>('/jobs/stats'),
        apiFetch<{ data: IngestionLog[] }>('/admin/jobs/logs?limit=10'),
        // Correct endpoint: GET /api/jobs/admin/feedback
        apiFetch<FeedbackRow[]>('/jobs/admin/feedback'),
      ]);
      setStats(s);
      setLogs(logsRes.data);
      setFeedback(fb);
    } catch (e) {
      console.error('Dashboard load failed:', (e as Error).message);
    } finally { setLoadingD(false); }
  }, []);

  // ── Load jobs tab ───────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    setLoadingJ(true);
    try {
      const params = new URLSearchParams({
        page: String(jobPage), limit: '20',
        minScore: String(minScore),
        sortBy: 'relevance_score', order: 'DESC',
      });
      const r = await apiFetch<{ data: Job[]; pagination: { total: number } }>(`/jobs?${params}`);
      setJobs(r.data);
      setJobTotal(r.pagination.total);
    } catch (e) {
      console.error('Jobs load failed:', (e as Error).message);
    } finally { setLoadingJ(false); }
  }, [jobPage, minScore, decFilter]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === 'jobs') loadJobs(); }, [tab, loadJobs]);
  useEffect(() => {
    if (tab === 'dashboard') {
      const t = setInterval(loadDashboard, 30_000);
      return () => clearInterval(t);
    }
  }, [tab, loadDashboard]);

  // ── Run calibration ─────────────────────────────────────────
  async function runCalibration() {
    setCalibBusy(true);
    try {
      // Correct: GET /api/admin/jobs/calibration (not POST /calibrate)
      const rows = await apiFetch<FeedbackRow[]>('/admin/jobs/calibration');
      setCalibRows(rows);
    } catch (e) {
      alert((e as Error).message);
    } finally { setCalibBusy(false); }
  }

  // ── Quick actions ───────────────────────────────────────────
  async function act(
    path: string,
    setbusy: (b: boolean) => void,
    startMsg: string,
    doneMsg: string
  ) {
    setbusy(true); setActionMsg(startMsg);
    try {
      await apiFetch(path, { method: 'POST' });
      setActionMsg(doneMsg);
    } catch (e) {
      setActionMsg(`✗ ${(e as Error).message}`);
    } finally {
      setbusy(false);
      setTimeout(() => setActionMsg(''), 4000);
    }
  }

  // ── Styles ───────────────────────────────────────────────────
  const cardD = 'rounded-xl border p-5 bg-zinc-900/60 border-zinc-800';
  const tabBtn = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
    }`;

  const actionLabel = (action: string) =>
    action === 'applied' ? '✓ Applied'
    : action === 'saved'    ? '⭐ Saved'
    : action === 'skipped'  ? '✗ Skipped'
    : action === 'hidden'   ? '🚫 Hidden'
    : action;

  const actionColour = (action: string) =>
    action === 'applied' ? '#22c55e'
    : action === 'saved'    ? '#818cf8'
    : action === 'skipped'  ? '#f87171'
    : '#71717a';

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-10 px-4" style={{ background: 'var(--bg-page,#09090b)', color: 'var(--text-1,#f4f4f5)' }}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Job System</h1>
            <p className="text-sm text-zinc-400 mt-1">
              AI-powered aggregation · Claude Haiku scoring · digest at 08:15 Paris
            </p>
          </div>
          {actionMsg && (
            <div className="text-sm px-4 py-2 rounded-lg font-medium"
              style={{
                background: actionMsg.startsWith('✓') ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                color:      actionMsg.startsWith('✓') ? '#22c55e' : '#f87171',
              }}>
              {actionMsg}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          {(['dashboard','jobs','logs','calibration'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={tabBtn(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ══ DASHBOARD ══════════════════════════════════════ */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats strip — field names match GET /api/jobs/stats response */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: '✓ Keep',   value: stats?.keep     ?? '—', colour: '#22c55e' },
                { label: '◎ Review', value: stats?.review   ?? '—', colour: '#eab308' },
                { label: '✗ Drop',   value: stats?.drop     ?? '—', colour: '#f87171' },
                { label: 'Last 24h', value: stats?.last_24h ?? '—', colour: '#06b6d4' },
                { label: 'Avg score',value: stats?.avg_score ?? '—', colour: '#a78bfa' },
              ].map(s => (
                <div key={s.label} className={`${cardD} text-center`}>
                  <div className="text-2xl font-bold mb-1" style={{ color: s.colour }}>{s.value}</div>
                  <div className="text-xs text-zinc-500">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Quick actions */}
              <div className={cardD}>
                <h2 className="font-semibold text-sm mb-4 text-zinc-300">Quick Actions</h2>
                <div className="space-y-2">
                  <button disabled={ingestBusy} onClick={() => act('/admin/jobs/ingest', setIngestBusy, 'Ingestion started…', '✓ Ingestion running in background')}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors">
                    {ingestBusy ? '⏳ Running…' : '▶ Ingest Jobs Now'}
                  </button>
                  <button disabled={filterBusy} onClick={() => act('/admin/jobs/filter', setFilterBusy, 'AI filtering started…', '✓ Filtering running in background')}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
                    {filterBusy ? '⏳ Running…' : '🤖 Run AI Filtering'}
                  </button>
                  <button disabled={digestBusy} onClick={() => act('/admin/jobs/send-alerts', setDigestBusy, 'Sending digest…', '✓ Job digest sent')}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 transition-colors">
                    {digestBusy ? '⏳ Sending…' : '📧 Send Job Digest Now'}
                  </button>
                  <button onClick={() => setTab('calibration')}
                    className="w-full py-2.5 rounded-lg text-sm font-medium border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
                    ⚖️ Calibration Report
                  </button>
                </div>
              </div>

              {/* Feedback summary — uses FeedbackRow from GET /api/jobs/admin/feedback */}
              <div className={cardD}>
                <h2 className="font-semibold text-sm mb-4 text-zinc-300">Your Feedback</h2>
                {loadingD ? (
                  <p className="text-sm text-zinc-600">Loading…</p>
                ) : feedback.length === 0 ? (
                  <p className="text-sm text-zinc-600">No feedback yet. Mark jobs as Applied or Skip in the Jobs tab.</p>
                ) : (
                  <div className="space-y-3">
                    {feedback.map(f => (
                      <div key={f.action} className="flex items-center justify-between text-sm">
                        <span style={{ color: actionColour(f.action) }}>{actionLabel(f.action)}</span>
                        <span className="font-bold text-zinc-300">{f.n} jobs</span>
                        <span className="text-xs text-zinc-500">avg {f.avg_ai_score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent logs */}
              <div className={cardD}>
                <h2 className="font-semibold text-sm mb-4 text-zinc-300">Recent Ingestion Logs</h2>
                <div className="space-y-2">
                  {logs.slice(0, 6).map(log => (
                    <div key={log.id} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-zinc-400 font-mono truncate">{log.source_api}</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        log.status === 'SUCCESS' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                      }`}>{log.status}</span>
                      <span className="text-zinc-500 flex-shrink-0">+{log.jobs_new}</span>
                      <span className="text-zinc-600 flex-shrink-0">{(log.duration_ms / 1000).toFixed(1)}s</span>
                    </div>
                  ))}
                  {logs.length === 0 && <p className="text-sm text-zinc-600">No logs yet.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ JOBS TAB ════════════════════════════════════════ */}
        {tab === 'jobs' && (
          <div className="space-y-5">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Min score</label>
                <input type="range" min="0" max="100" step="5"
                  value={minScore} onChange={e => { setMinScore(+e.target.value); setJobPage(1); }}
                  className="w-28 accent-violet-500" />
                <span className="text-xs font-mono text-violet-400 w-8">{minScore}</span>
              </div>
              {['KEEP,REVIEW', 'KEEP', 'REVIEW'].map(d => (
                <button key={d} onClick={() => { setDecFilter(d); setJobPage(1); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    decFilter === d
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}>
                  {d === 'KEEP,REVIEW' ? 'All relevant' : d}
                </button>
              ))}
              <span className="text-xs text-zinc-600">{jobTotal} jobs</span>
              <button onClick={loadJobs}
                className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500">
                ↻ Refresh
              </button>
            </div>

            {/* Job list */}
            {loadingJ ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} className={`${cardD} group`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            job.ai_decision === 'KEEP'
                              ? 'bg-green-900/40 text-green-400'
                              : 'bg-yellow-900/40 text-yellow-400'
                          }`}>{job.ai_decision}</span>
                          <span className="text-xs text-zinc-500">{job.source_api}</span>
                          {job.visa_sponsored === true && <span className="text-xs text-cyan-500">🛂 Visa</span>}
                          {job.seniority_level && <span className="text-xs text-zinc-600">{job.seniority_level}</span>}
                        </div>
                        <h3 className="font-semibold text-sm text-zinc-100 truncate">
                          <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
                            className="hover:text-violet-400 transition-colors">
                            {job.title}
                          </a>
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{job.company_name} · {job.location}</p>
                        {job.ai_reasoning && (
                          <p className="text-xs text-zinc-600 italic mt-1">{job.ai_reasoning}</p>
                        )}
                        {(job.tech_stack || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {job.tech_stack.slice(0, 8).map(t => (
                              <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="w-28"><ScoreBar score={job.relevance_score} /></div>
                        <FeedbackButtons jobId={job.id} onDone={loadJobs} />
                      </div>
                    </div>
                  </div>
                ))}
                {jobs.length === 0 && (
                  <div className={`${cardD} text-center py-12 text-zinc-600`}>
                    No jobs match your current filters.
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {jobTotal > 20 && (
              <div className="flex justify-center gap-2">
                <button disabled={jobPage === 1} onClick={() => setJobPage(p => p - 1)}
                  className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-400 disabled:opacity-40 hover:bg-zinc-700">
                  ← Prev
                </button>
                <span className="px-4 py-2 text-sm text-zinc-500">
                  Page {jobPage} of {Math.ceil(jobTotal / 20)}
                </span>
                <button disabled={jobPage >= Math.ceil(jobTotal / 20)} onClick={() => setJobPage(p => p + 1)}
                  className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-400 disabled:opacity-40 hover:bg-zinc-700">
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ LOGS TAB ════════════════════════════════════════ */}
        {tab === 'logs' && (
          <div className={cardD}>
            <h2 className="font-semibold text-sm mb-4">Ingestion Logs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="text-left pb-2 pr-4">Source</th>
                    <th className="text-left pb-2 pr-4">Status</th>
                    <th className="text-right pb-2 pr-4">Fetched</th>
                    <th className="text-right pb-2 pr-4">New</th>
                    <th className="text-right pb-2 pr-4">Dupes</th>
                    <th className="text-right pb-2 pr-4">Duration</th>
                    <th className="text-right pb-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {logs.map(log => (
                    <tr key={log.id} className="text-xs">
                      <td className="py-2.5 pr-4 font-mono text-zinc-300">{log.source_api}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                          log.status === 'SUCCESS' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                        }`}>{log.status}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-zinc-400">{log.jobs_fetched}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-zinc-300">{log.jobs_new}</td>
                      <td className="py-2.5 pr-4 text-right text-zinc-500">{log.jobs_duplicates}</td>
                      <td className="py-2.5 pr-4 text-right text-zinc-500">{(log.duration_ms / 1000).toFixed(1)}s</td>
                      <td className="py-2.5 text-right text-zinc-600">
                        {new Date(log.created_at).toLocaleString('en-GB', {
                          hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && <p className="text-sm text-zinc-600 text-center py-8">No logs yet.</p>}
            </div>
          </div>
        )}

        {/* ══ CALIBRATION TAB ═════════════════════════════════ */}
        {tab === 'calibration' && (
          <div className="space-y-5">
            <div className={cardD}>
              <h2 className="font-semibold mb-2">AI Score Calibration</h2>
              <p className="text-sm text-zinc-500 mb-4">
                Shows how the AI scored jobs you gave feedback on. If you applied to low-scored jobs
                or skipped high-scored ones, the model needs calibration.
              </p>
              <button disabled={calibBusy} onClick={runCalibration}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors">
                {calibBusy ? '⏳ Loading…' : '⚖️ Load Calibration Report'}
              </button>
            </div>

            {calibRows.length > 0 && (
              <>
                {/* Per-action breakdown */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {calibRows.map(row => (
                    <div key={row.action} className={cardD}>
                      <p className="text-sm font-semibold mb-3" style={{ color: actionColour(row.action) }}>
                        {actionLabel(row.action)}
                      </p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Jobs</span>
                          <span className="font-bold">{row.n}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Avg AI score</span>
                          <span className="font-bold">{row.avg_ai_score}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Scored ≥65</span>
                          <span className="text-green-400">{row.high_scored}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Scored &lt;65</span>
                          <span className="text-red-400">{row.low_scored}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Insights */}
                <div className={cardD}>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3">Calibration Insights</h3>
                  <div className="space-y-2 text-sm">
                    {calibRows.filter(r => r.action === 'applied').map(r => (
                      parseFloat(r.avg_ai_score) < 65 ? (
                        <p key="applied-low" className="text-yellow-400">
                          ⚠ You applied to jobs with avg score {r.avg_ai_score}/100 — below the 65 threshold.
                          Claude may be under-scoring your preferred roles. Consider lowering MIN_SCORE in config.js.
                        </p>
                      ) : (
                        <p key="applied-ok" className="text-green-400">
                          ✓ Applied jobs averaged {r.avg_ai_score}/100 — AI scoring is well-calibrated for your applications.
                        </p>
                      )
                    ))}
                    {calibRows.filter(r => r.action === 'skipped').map(r => (
                      parseFloat(r.avg_ai_score) > 70 ? (
                        <p key="skipped-high" className="text-orange-400">
                          ⚠ You skipped jobs averaging {r.avg_ai_score}/100 — Claude is over-scoring some roles.
                          Review the skipped jobs and consider adding those tech stacks to avoid_tech_stack in preferences.
                        </p>
                      ) : (
                        <p key="skipped-ok" className="text-zinc-400">
                          ✓ Skipped jobs averaged {r.avg_ai_score}/100 — appropriate that they were filtered lower.
                        </p>
                      )
                    ))}
                    {calibRows.length === 0 && (
                      <p className="text-zinc-600">Give feedback on jobs in the Jobs tab to generate insights.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
