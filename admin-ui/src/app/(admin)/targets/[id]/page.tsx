'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { Job, JobCard, JobDetail, EmptyDetail } from '@/components/JobCard';

interface JobTarget {
  id: string;
  role_query: string;
  locations: string[];
  is_active: boolean;
  min_score: number | null;
  notes: string | null;
  posted_within_days: number | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function EmptyMatches() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-3xl mb-3 opacity-20">◍</div>
      <p className="text-gray-500 text-sm">No current jobs match this target.</p>
      <p className="text-gray-600 text-xs mt-1">Try lowering the score threshold or clearing the search.</p>
    </div>
  );
}

export default function TargetMatchesPage() {
  return (
    <Suspense>
      <TargetMatchesPageInner />
    </Suspense>
  );
}

function TargetMatchesPageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetId = params.id;

  const [target,        setTarget]        = useState<JobTarget | null>(null);
  const [notFound,      setNotFound]      = useState(false);
  const [targetLoading, setTargetLoading] = useState(true);

  const [q,           setQInput]      = useState(() => searchParams.get('q')          ?? '');
  const [qDebounced,  setQ]           = useState(() => searchParams.get('q')          ?? '');
  const [minScore,    setMinScore]    = useState(() => searchParams.get('minScore')   ?? '');
  const [sort,        setSort]        = useState(() => searchParams.get('sort')       || 'score');
  const [aiDecision,  setAiDecision]  = useState(() => searchParams.get('ai_decision') ?? '');

  const [jobs,        setJobs]        = useState<Job[]>([]);
  const [selected,    setSelected]    = useState<Job | null>(null);
  const [pagination,  setPagination]  = useState<Pagination | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionLoad,  setActionLoad]  = useState<string | null>(null);
  const [mobileDetail,        setMobileDetail]        = useState(false);
  const [creatingAppForJobId, setCreatingAppForJobId]  = useState<string | null>(null);

  // Debounce the search box — avoid firing a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(q), 450);
    return () => clearTimeout(t);
  }, [q]);

  // Keep the URL in sync with filter state so a bookmarked/shared link
  // reproduces the same filtered view.
  useEffect(() => {
    const p = new URLSearchParams();
    if (qDebounced)       p.set('q', qDebounced);
    if (minScore)         p.set('minScore', minScore);
    if (sort !== 'score') p.set('sort', sort);
    if (aiDecision)       p.set('ai_decision', aiDecision);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [qDebounced, minScore, sort, aiDecision]);

  useEffect(() => {
    setTargetLoading(true);
    adminApi.getJobTarget(targetId)
      .then(setTarget)
      .catch(() => setNotFound(true))
      .finally(() => setTargetLoading(false));
  }, [targetId]);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const p: Record<string, string> = { sort, limit: '20', page: '1' };
      if (qDebounced)  p.q            = qDebounced;
      if (minScore)    p.minScore     = minScore;
      if (aiDecision)  p.ai_decision  = aiDecision;
      const res = await adminApi.getTargetMatches(targetId, p);
      setJobs(res.data);
      setPagination(res.pagination);
      setSelected(null);
    } catch (e) {
      console.error('Failed to load target matches:', e);
    } finally {
      setLoading(false);
    }
  }, [targetId, sort, qDebounced, minScore, aiDecision]);

  const loadMore = useCallback(async () => {
    if (!pagination || pagination.page >= pagination.pages) return;
    setLoadingMore(true);
    try {
      const p: Record<string, string> = { sort, limit: '20', page: String(pagination.page + 1) };
      if (qDebounced)  p.q            = qDebounced;
      if (minScore)    p.minScore     = minScore;
      if (aiDecision)  p.ai_decision  = aiDecision;
      const res = await adminApi.getTargetMatches(targetId, p);
      setJobs(prev => [...prev, ...res.data]);
      setPagination(res.pagination);
    } finally {
      setLoadingMore(false);
    }
  }, [targetId, pagination, sort, qDebounced, minScore, aiDecision]);

  useEffect(() => { if (target) loadMatches(); }, [target, loadMatches]);

  const handleAction = useCallback(async (jobId: string, action: string) => {
    setActionLoad(jobId + action);
    try {
      await adminApi.jobFeedback(jobId, action);
      if (action === 'skipped') {
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
        setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, user_decision: 'applied' } : j)));
        if (selected?.id === jobId) {
          setSelected(s => (s ? { ...s, user_decision: 'applied' } : s));
        }
      } else {
        await loadMatches();
      }
    } catch (e) {
      console.error('Action failed:', e);
    } finally {
      setActionLoad(null);
    }
  }, [selected, loadMatches]);

  const handleCreateApplication = async (jobId: string) => {
    setCreatingAppForJobId(jobId);
    try {
      const data = await adminApi.createApplication(jobId);
      router.push(`/applications/${data.id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreatingAppForJobId(null);
    }
  };

  const handleSelectJob = (job: Job) => {
    setSelected(job);
    setMobileDetail(true);
  };

  if (targetLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !target) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm mb-3">This target no longer exists.</p>
        <Link href="/targets" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Job Targets</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Page header */}
      <div className="mb-4">
        <Link href="/targets" className="text-xs text-gray-500 hover:text-gray-300">← Back to Job Targets</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-xl font-bold text-white">{target.role_query}</h1>
          {!target.is_active && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">Paused</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(target.locations.length ? target.locations : ['Remote-open']).map(loc => (
            <span key={loc} className="px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 text-xs font-mono">{loc}</span>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Posted within: {target.posted_within_days ? `${target.posted_within_days}d` : 'Any time'}
          {' · '}Min score: {target.min_score ?? 'default'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={q}
          onChange={e => setQInput(e.target.value)}
          placeholder="Search title or company…"
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:border-indigo-500
            placeholder:text-gray-600"
        />

        <select value={sort} onChange={e => setSort(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="score">Sort: Score</option>
          <option value="date">Sort: Newest</option>
        </select>

        <select value={aiDecision} onChange={e => setAiDecision(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="">Kept + Review (default)</option>
          <option value="KEEP">Keep only</option>
          <option value="REVIEW">Review only</option>
          <option value="DROP">Dropped</option>
        </select>

        <select value={minScore} onChange={e => setMinScore(e.target.value)}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300
            rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
          <option value="">Target default ({target.min_score ?? 'global'})</option>
          <option value="0">Any score</option>
          <option value="50">50+</option>
          <option value="65">65+</option>
          <option value="75">75+</option>
          <option value="85">85+</option>
        </select>

        {(q || minScore || aiDecision) && (
          <button
            onClick={() => { setQInput(''); setQ(''); setMinScore(''); setAiDecision(''); }}
            className="text-xs px-3 py-1.5 rounded-lg text-red-400 hover:text-red-300
              bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 transition-colors">
            Clear filters
          </button>
        )}

        {pagination && !loading && (
          <span className="text-xs text-gray-600 ml-auto">
            {pagination.total} job{pagination.total !== 1 ? 's' : ''} matching
          </span>
        )}
      </div>

      {/* Split panel */}
      <div className="flex gap-4 items-start">
        <div className={`w-full md:w-5/12 flex flex-col gap-2
          overflow-y-auto max-h-[calc(100vh-380px)] min-h-[300px] pr-0.5
          ${mobileDetail ? 'hidden md:flex' : 'flex'}`}
        >
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))
          ) : jobs.length === 0 ? (
            <EmptyMatches />
          ) : (
            <>
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  actionLoading={actionLoad}
                  creatingAppForJobId={creatingAppForJobId}
                  onSelect={() => handleSelectJob(job)}
                  onAction={handleAction}
                  onCreateApplication={handleCreateApplication}
                />
              ))}

              {pagination && pagination.page < pagination.pages && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm text-gray-400 hover:text-white
                    bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700
                    disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading…' : `Load more (${pagination.total - jobs.length} remaining)`}
                </button>
              )}
            </>
          )}
        </div>

        <div className={`flex-1 overflow-y-auto max-h-[calc(100vh-380px)] min-h-[300px]
          ${mobileDetail ? 'block' : 'hidden md:block'}`}
        >
          {selected ? (
            <JobDetail
              job={selected}
              actionLoading={actionLoad}
              creatingAppForJobId={creatingAppForJobId}
              onAction={handleAction}
              onCreateApplication={handleCreateApplication}
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
