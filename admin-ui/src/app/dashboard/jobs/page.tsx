'use client';
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';

function getUrlParam(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

// ── Types ────────────────────────────────────────────────────
type Tab = 'new' | 'saved' | 'applied';

interface Job {
  id: string;
  company_name: string;
  title: string;
  location: string;
  job_type: string;
  description: string;
  requirements: string;
  apply_url: string;
  source_api: string;
  relevance_score: number;
  ai_decision: string;
  ai_reasoning: string;
  tech_stack: string[];
  seniority_level: string;
  visa_sponsored: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string;
  user_decision: string | null;
}

interface Progress {
  total_pipeline: string;
  new_count: string;
  saved_count: string;
  applied_count: string;
  reviewed_count: string;
  added_today: string;
  applied_this_week: string;
  avg_score: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ── Helpers ──────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  adzuna: 'Adzuna',
  joobleApi: 'Jooble',
  remoteOk: 'RemoteOK',
};

function scoreStyle(s: number) {
  if (s >= 80) return 'bg-green-900/40 text-green-400 border border-green-700/40';
  if (s >= 60) return 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40';
  if (s >= 40) return 'bg-orange-900/40 text-orange-400 border border-orange-700/40';
  return 'bg-red-900/40 text-red-400 border border-red-700/40';
}

function scoreBar(s: number) {
  if (s >= 80) return 'bg-green-500';
  if (s >= 60) return 'bg-yellow-500';
  if (s >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

function timeAgo(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatSalary(job: Job) {
  if (!job.salary_min && !job.salary_max) return null;
  const sym = { GBP: '£', EUR: '€', USD: '$' }[job.salary_currency ?? ''] ?? '';
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (job.salary_min && job.salary_max) return `${sym}${f(job.salary_min)}–${sym}${f(job.salary_max)}`;
  if (job.salary_min) return `from ${sym}${f(job.salary_min)}`;
  return `up to ${sym}${f(job.salary_max!)}`;
}

// ── Progress stats bar ───────────────────────────────────────
function ProgressStats({ p }: { p: Progress }) {
  const total    = parseInt(p.total_pipeline) || 0;
  const reviewed = parseInt(p.reviewed_count) || 0;
  const pct      = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const newC     = parseInt(p.new_count) || 0;
  const savedC   = parseInt(p.saved_count) || 0;
  const appliedC = parseInt(p.applied_count) || 0;
  const today    = parseInt(p.added_today) || 0;
  const week     = parseInt(p.applied_this_week) || 0;
  const avg      = p.avg_score ? parseFloat(p.avg_score) : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
      {/* Progress bar row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400 font-medium">Review Progress</span>
        <span className="text-sm font-semibold text-white">{pct}%
          <span className="text-gray-500 font-normal ml-1">({reviewed} of {total} reviewed)</span>
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="New" value={newC} color="text-white" />
        <Stat label="Saved" value={savedC} color="text-yellow-400" />
        <Stat label="Applied" value={appliedC} color="text-green-400" />
        <Stat label="Added today" value={`+${today}`} color="text-indigo-400" />
        <Stat label="Applied this week" value={week} color="text-purple-400" />
      </div>

      {avg !== null && (
        <p className="text-xs text-gray-500 mt-3">
          Pipeline average score: <span className="text-gray-300 font-medium">{avg}</span>
          {week > 0 && <span className="ml-3">· {week} application{week !== 1 ? 's' : ''} this week</span>}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Job card (list item) ─────────────────────────────────────
function JobCard({
  job, selected, actionLoading, onSelect, onAction,
}: {
  job: Job;
  selected: boolean;
  actionLoading: string | null;
  onSelect: () => void;
  onAction: (id: string, action: string) => void;
}) {
  const sal = formatSalary(job);
  const busy = (a: string) => actionLoading === job.id + a;

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer rounded-xl border p-3.5 transition-all
        ${selected
          ? 'border-indigo-500 bg-indigo-950/40'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700 hover:bg-gray-800/60'
        }`}
    >
      {/* Top row: score + title */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${scoreStyle(job.relevance_score)}`}>
          {job.relevance_score}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-tight truncate">{job.title}</p>
          <p className="text-xs text-gray-400 truncate">{job.company_name} · {job.location}</p>
        </div>
      </div>

      {/* Tech tags */}
      {job.tech_stack?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {job.tech_stack.slice(0, 4).map(t => (
            <span key={t} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{t}</span>
          ))}
          {job.tech_stack.length > 4 && (
            <span className="text-xs text-gray-600">+{job.tech_stack.length - 4}</span>
          )}
        </div>
      )}

      {/* Bottom row: meta + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{SOURCE_LABELS[job.source_api] ?? job.source_api}</span>
          <span>·</span>
          <span>{timeAgo(job.posted_at)}</span>
          {sal && <><span>·</span><span className="text-gray-400">{sal}</span></>}
          {job.visa_sponsored && <span className="text-blue-400">· Visa ✓</span>}
        </div>

        {/* Quick actions — only show if no user decision yet */}
        {!job.user_decision && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}>
            <ActionBtn
              label="♥" title="Save" color="text-yellow-400 hover:bg-yellow-900/40"
              loading={busy('saved')} onClick={() => onAction(job.id, 'saved')}
            />
            <ActionBtn
              label="✕" title="Skip" color="text-red-400 hover:bg-red-900/40"
              loading={busy('skipped')} onClick={() => onAction(job.id, 'skipped')}
            />
          </div>
        )}

        {job.user_decision && (
          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-500">
            {job.user_decision}
          </span>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label, title, color, loading, onClick,
}: {
  label: string; title: string; color: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      title={title}
      disabled={loading}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs
        bg-gray-800 transition-colors disabled:opacity-40 ${color}`}
    >
      {loading ? '…' : label}
    </button>
  );
}

// ── Job detail panel ─────────────────────────────────────────
function JobDetail({
  job, actionLoading, onAction, onClose,
}: {
  job: Job;
  actionLoading: string | null;
  onAction: (id: string, action: string) => void;
  onClose?: () => void;
}) {
  const sal = formatSalary(job);
  const busy = (a: string) => actionLoading === job.id + a;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white leading-tight">{job.title}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {job.company_name} · {job.location}
              {job.job_type && <span className="ml-2 text-gray-500">· {job.job_type}</span>}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose}
              className="shrink-0 text-gray-500 hover:text-white transition-colors text-lg leading-none">
              ✕
            </button>
          )}
        </div>

        {/* Score + reasoning */}
        <div className={`mt-3 flex items-start gap-3 p-3 rounded-lg ${scoreStyle(job.relevance_score)} bg-opacity-20`}>
          <div className="shrink-0 text-center">
            <div className="text-2xl font-black">{job.relevance_score}</div>
            <div className="text-xs opacity-70">{job.ai_decision}</div>
          </div>
          <div className="min-w-0">
            <div className="h-1.5 bg-gray-800 rounded-full mb-2 overflow-hidden">
              <div className={`h-full rounded-full ${scoreBar(job.relevance_score)}`}
                style={{ width: `${job.relevance_score}%` }} />
            </div>
            {job.ai_reasoning && (
              <p className="text-xs opacity-90 leading-relaxed">{job.ai_reasoning}</p>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          {job.seniority_level && (
            <Chip label={job.seniority_level} color="bg-indigo-900/40 text-indigo-300" />
          )}
          {job.visa_sponsored === true && (
            <Chip label="Visa Sponsored ✓" color="bg-blue-900/40 text-blue-300" />
          )}
          {job.visa_sponsored === false && (
            <Chip label="No Visa" color="bg-gray-800 text-gray-500" />
          )}
          {sal && <Chip label={sal} color="bg-green-900/40 text-green-300" />}
          <Chip label={SOURCE_LABELS[job.source_api] ?? job.source_api} color="bg-gray-800 text-gray-400" />
          <Chip label={timeAgo(job.posted_at)} color="bg-gray-800 text-gray-400" />
        </div>

        {/* Tech stack */}
        {job.tech_stack?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tech Stack</p>
            <div className="flex flex-wrap gap-1.5">
              {job.tech_stack.map(t => (
                <span key={t} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</p>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {job.description || 'No description available.'}
          </p>
        </div>

        {/* Requirements */}
        {job.requirements && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Requirements</p>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{job.requirements}</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        {/* Apply button */}
        <a
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => !job.user_decision && onAction(job.id, 'applied')}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg
            bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          Apply Now →
        </a>

        {/* Secondary actions */}
        {!job.user_decision && (
          <div className="flex gap-2">
            <button
              disabled={busy('saved')}
              onClick={() => onAction(job.id, 'saved')}
              className="flex-1 py-2 rounded-lg text-sm text-yellow-400 bg-yellow-900/20
                hover:bg-yellow-900/40 border border-yellow-700/30 disabled:opacity-40 transition-colors"
            >
              {busy('saved') ? '…' : '♥ Save for later'}
            </button>
            <button
              disabled={busy('skipped')}
              onClick={() => onAction(job.id, 'skipped')}
              className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800
                hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {busy('skipped') ? '…' : '✕ Skip'}
            </button>
          </div>
        )}

        {job.user_decision === 'saved' && (
          <div className="flex gap-2">
            <button
              disabled={busy('applied')}
              onClick={() => onAction(job.id, 'applied')}
              className="flex-1 py-2 rounded-lg text-sm text-green-400 bg-green-900/20
                hover:bg-green-900/40 border border-green-700/30 disabled:opacity-40 transition-colors"
            >
              {busy('applied') ? '…' : '✓ Mark Applied'}
            </button>
            <button
              disabled={busy('skipped')}
              onClick={() => onAction(job.id, 'skipped')}
              className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800
                hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {busy('skipped') ? '…' : '✕ Skip'}
            </button>
          </div>
        )}

        {job.user_decision === 'applied' && (
          <p className="text-center text-sm text-green-400 py-1">✓ Applied</p>
        )}
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${color}`}>{label}</span>
  );
}

// ── Empty states ─────────────────────────────────────────────
function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8
      bg-gray-900 border border-gray-800 rounded-xl">
      <div className="text-4xl mb-3 opacity-30">◳</div>
      <p className="text-gray-500 text-sm">Select a job to view details</p>
    </div>
  );
}

function EmptyList({ tab }: { tab: Tab }) {
  const msgs: Record<Tab, { icon: string; text: string }> = {
    new:     { icon: '✓', text: 'All caught up — no new jobs to review.' },
    saved:   { icon: '♥', text: 'No saved jobs yet. Save jobs from the New tab.' },
    applied: { icon: '◎', text: 'No applications tracked yet.' },
  };
  const { icon, text } = msgs[tab];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-3xl mb-3 opacity-20">{icon}</div>
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function JobsPage() {
  const [tab,          setTab]          = useState<Tab>(() => (getUrlParam('tab') as Tab) || 'new');
  const [source,       setSource]       = useState(() => getUrlParam('source'));
  const [visa,         setVisa]         = useState(() => getUrlParam('visa') === 'true');
  const [sort,         setSort]         = useState(() => getUrlParam('sort') || 'score');
  const [seniority,    setSeniority]    = useState(() => getUrlParam('seniority'));
  const [minScore,     setMinScore]     = useState(() => getUrlParam('minScore'));
  const [locInput,     setLocInput]     = useState(() => getUrlParam('location'));
  const [loc,          setLoc]          = useState(() => getUrlParam('location'));
  const [jobs,         setJobs]         = useState<Job[]>([]);
  const [selected,     setSelected]     = useState<Job | null>(null);
  const [progress,     setProgress]     = useState<Progress | null>(null);
  const [pagination,   setPagination]   = useState<Pagination | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [actionLoad,   setActionLoad]   = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const loadProgress = useCallback(async () => {
    try {
      const p = await adminApi.getJobsProgress();
      setProgress(p);
    } catch { /* non-fatal */ }
  }, []);

  // Debounce location text input — avoids firing an API call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setLoc(locInput), 450);
    return () => clearTimeout(t);
  }, [locInput]);

  // Keep URL in sync with filter state so filters survive page refresh
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== 'new')    p.set('tab', tab);
    if (sort !== 'score') p.set('sort', sort);
    if (source)           p.set('source', source);
    if (visa)             p.set('visa', 'true');
    if (seniority)        p.set('seniority', seniority);
    if (minScore)         p.set('minScore', minScore);
    if (loc)              p.set('location', loc);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [tab, sort, source, visa, seniority, minScore, loc]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { tab, sort, limit: '20', page: '1' };
      if (source)   params.source    = source;
      if (visa)     params.visa      = 'true';
      if (seniority) params.seniority = seniority;
      if (minScore) params.min_score  = minScore;
      if (loc)      params.location   = loc;
      const res = await adminApi.getJobsPipeline(params);
      setJobs(res.data);
      setPagination(res.pagination);
      setSelected(null);
    } catch (e) {
      console.error('Failed to load jobs:', e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, source, visa, sort, seniority, minScore, loc]);

  const loadMore = useCallback(async () => {
    if (!pagination || pagination.page >= pagination.pages) return;
    setLoadingMore(true);
    try {
      const params: Record<string, string> = {
        tab, sort, limit: '20', page: String(pagination.page + 1),
      };
      if (source)    params.source    = source;
      if (visa)      params.visa      = 'true';
      if (seniority) params.seniority = seniority;
      if (minScore)  params.min_score = minScore;
      if (loc)       params.location  = loc;
      const res = await adminApi.getJobsPipeline(params);
      setJobs(prev => [...prev, ...res.data]);
      setPagination(res.pagination);
    } finally {
      setLoadingMore(false);
    }
  }, [pagination, tab, sort, source, visa, seniority, minScore, loc]);

  const handleAction = useCallback(async (jobId: string, action: string) => {
    setActionLoad(jobId + action);
    try {
      await adminApi.jobFeedback(jobId, action);

      if (action === 'skipped') {
        // Remove immediately — skipped jobs disappear from all tabs
        setJobs(prev => {
          const idx = prev.findIndex(j => j.id === jobId);
          const next = prev[idx + 1] ?? prev[idx - 1] ?? null;
          if (selected?.id === jobId) {
            setSelected(next);
            if (!next) setMobileDetail(false);
          }
          return prev.filter(j => j.id !== jobId);
        });
      } else if (action === 'saved' && tab === 'new') {
        // Move out of new tab
        setJobs(prev => {
          const idx = prev.findIndex(j => j.id === jobId);
          const next = prev[idx + 1] ?? prev[idx - 1] ?? null;
          if (selected?.id === jobId) {
            setSelected(next);
            if (!next) setMobileDetail(false);
          }
          return prev.filter(j => j.id !== jobId);
        });
      } else if (action === 'applied') {
        // Update in-place with user_decision tag
        setJobs(prev => prev.map(j =>
          j.id === jobId ? { ...j, user_decision: 'applied' } : j
        ));
        if (selected?.id === jobId) {
          setSelected(s => s ? { ...s, user_decision: 'applied' } : s);
        }
      } else {
        // Refresh the whole list for other transitions
        await loadJobs();
      }
      await loadProgress();
    } catch (e) {
      console.error('Action failed:', e);
    } finally {
      setActionLoad(null);
    }
  }, [tab, selected, loadJobs, loadProgress]);

  // Initial load
  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleSelectJob = (job: Job) => {
    setSelected(job);
    setMobileDetail(true);
  };

  const tabCounts: Record<Tab, string> = {
    new:     progress ? progress.new_count     : '…',
    saved:   progress ? progress.saved_count   : '…',
    applied: progress ? progress.applied_count : '…',
  };

  return (
    <div className="flex flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Job Pipeline</h1>
          <p className="text-gray-500 text-sm mt-0.5">Review AI-scored jobs and track applications</p>
        </div>
        <button
          onClick={() => { loadJobs(); loadProgress(); }}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg
            bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Progress stats */}
      {progress && <ProgressStats p={progress} />}

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(['new', 'saved', 'applied'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize
              ${tab === t
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
          >
            {t}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full
              ${tab === t ? 'bg-indigo-500 text-indigo-100' : 'bg-gray-800 text-gray-500'}`}>
              {tabCounts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="score">Sort: Score</option>
          <option value="date">Sort: Newest</option>
        </select>

        {/* Source */}
        <select value={source} onChange={e => setSource(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="">All sources</option>
          <option value="adzuna">Adzuna</option>
          <option value="joobleApi">Jooble</option>
          <option value="remoteOk">RemoteOK</option>
        </select>

        {/* Seniority */}
        <select value={seniority} onChange={e => setSeniority(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="">All levels</option>
          <option value="Junior">Junior</option>
          <option value="Mid">Mid</option>
          <option value="Senior">Senior</option>
        </select>

        {/* Min score */}
        <select value={minScore} onChange={e => setMinScore(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="">Any score</option>
          <option value="50">50+</option>
          <option value="65">65+</option>
          <option value="75">75+</option>
          <option value="85">85+</option>
        </select>

        {/* Location */}
        <input
          type="text"
          value={locInput}
          onChange={e => setLocInput(e.target.value)}
          placeholder="Location…"
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:border-indigo-500
            placeholder:text-gray-600"
        />

        {/* Visa toggle */}
        <button onClick={() => setVisa(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
            ${visa
              ? 'bg-blue-900/40 border-blue-700/50 text-blue-300'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}>
          Visa {visa ? '✓' : ''}
        </button>

        {/* Clear all filters */}
        {(source || seniority || minScore || locInput || visa) && (
          <button
            onClick={() => { setSource(''); setSeniority(''); setMinScore(''); setLocInput(''); setLoc(''); setVisa(false); }}
            className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300
              bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 transition-colors">
            Clear filters
          </button>
        )}

        {pagination && !loading && (
          <span className="text-xs text-gray-600 ml-auto">
            {pagination.total} job{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Split panel */}
      <div className="flex gap-4 items-start">

        {/* ── List panel ───────────────────────────────────── */}
        <div className={`w-full md:w-5/12 flex flex-col gap-2
          overflow-y-auto max-h-[calc(100vh-380px)] min-h-[300px] pr-0.5
          ${mobileDetail ? 'hidden md:flex' : 'flex'}`}
        >
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))
          ) : jobs.length === 0 ? (
            <EmptyList tab={tab} />
          ) : (
            <>
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  actionLoading={actionLoad}
                  onSelect={() => handleSelectJob(job)}
                  onAction={handleAction}
                />
              ))}

              {/* Load more */}
              {pagination && pagination.page < pagination.pages && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm text-gray-400 hover:text-white
                    bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700
                    disabled:opacity-50 transition-colors"
                >
                  {loadingMore
                    ? 'Loading…'
                    : `Load more (${pagination.total - jobs.length} remaining)`}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Detail panel ─────────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto max-h-[calc(100vh-380px)] min-h-[300px]
          ${mobileDetail ? 'block' : 'hidden md:block'}`}
        >
          {selected ? (
            <JobDetail
              job={selected}
              actionLoading={actionLoad}
              onAction={handleAction}
              onClose={mobileDetail ? () => setMobileDetail(false) : undefined}
            />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>
    </div>
  );
}
