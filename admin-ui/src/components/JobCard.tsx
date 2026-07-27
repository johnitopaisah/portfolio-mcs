// Shared job list-item + detail-panel rendering, used by both the Job
// Pipeline page and any target-scoped job view. Kept here (not inline in
// a page) so both stay in sync instead of drifting copies.

export interface Job {
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

export const SOURCE_LABELS: Record<string, string> = {
  greenhouse_search: 'Greenhouse',
  lever_search: 'Lever',
  ashby_search: 'Ashby',
  workday_search: 'Workday',
  smartrecruiters_search: 'SmartRecruiters',
  linkedin_search: 'LinkedIn',
  custom_site_search: 'Custom Site',
};

export function scoreStyle(s: number) {
  if (s >= 80) return 'bg-green-900/40 text-green-400 border border-green-700/40';
  if (s >= 60) return 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40';
  if (s >= 40) return 'bg-orange-900/40 text-orange-400 border border-orange-700/40';
  return 'bg-red-900/40 text-red-400 border border-red-700/40';
}

export function scoreBar(s: number) {
  if (s >= 80) return 'bg-green-500';
  if (s >= 60) return 'bg-yellow-500';
  if (s >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export function timeAgo(d: string) {
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatSalary(job: Job) {
  if (!job.salary_min && !job.salary_max) return null;
  const sym = { GBP: '£', EUR: '€', USD: '$' }[job.salary_currency ?? ''] ?? '';
  const f = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (job.salary_min && job.salary_max) return `${sym}${f(job.salary_min)}–${sym}${f(job.salary_max)}`;
  if (job.salary_min) return `from ${sym}${f(job.salary_min)}`;
  return `up to ${sym}${f(job.salary_max!)}`;
}

export function ActionBtn({
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

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${color}`}>{label}</span>
  );
}

export function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8
      bg-gray-900 border border-gray-800 rounded-xl">
      <div className="text-4xl mb-3 opacity-30">◳</div>
      <p className="text-gray-500 text-sm">Select a job to view details</p>
    </div>
  );
}

// ── Job card (list item) ─────────────────────────────────────
export function JobCard({
  job, selected, actionLoading, creatingAppForJobId, onSelect, onAction, onCreateApplication,
}: {
  job: Job;
  selected: boolean;
  actionLoading: string | null;
  creatingAppForJobId: string | null;
  onSelect: () => void;
  onAction: (id: string, action: string) => void;
  onCreateApplication: (id: string) => void;
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

        {/* Quick actions */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {(job.ai_decision === 'KEEP' || job.ai_decision === 'REVIEW') && job.relevance_score >= 60 && (
            <button
              onClick={() => onCreateApplication(job.id)}
              disabled={creatingAppForJobId === job.id}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {creatingAppForJobId === job.id ? 'Creating…' : 'Create Application'}
            </button>
          )}

          {!job.user_decision && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
  );
}

// ── Job detail panel ─────────────────────────────────────────
export function JobDetail({
  job, actionLoading, creatingAppForJobId, onAction, onCreateApplication, onClose,
}: {
  job: Job;
  actionLoading: string | null;
  creatingAppForJobId: string | null;
  onAction: (id: string, action: string) => void;
  onCreateApplication: (id: string) => void;
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

        {/* Create Application button — only for KEEP/REVIEW jobs scoring >= 60 */}
        {(job.ai_decision === 'KEEP' || job.ai_decision === 'REVIEW') && job.relevance_score >= 60 && (
          <button
            onClick={() => onCreateApplication(job.id)}
            disabled={creatingAppForJobId === job.id}
            className="flex items-center justify-center w-full py-2.5 rounded-lg
              bg-green-600 hover:bg-green-700 text-white text-sm font-semibold
              disabled:opacity-50 transition-colors"
          >
            {creatingAppForJobId === job.id ? 'Creating…' : '+ Create Application'}
          </button>
        )}

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
