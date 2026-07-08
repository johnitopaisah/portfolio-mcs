'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';

type Tab = 'targets' | 'discovery';

// ── Types ────────────────────────────────────────────────────
interface JobTarget {
  id: string;
  role_query: string;
  locations: string[];
  is_active: boolean;
  min_score: number | null;
  notes: string | null;
  posted_within_days: number | null;
  boards_discovered: number;
  last_polled_at: string | null;
  created_at: string;
}

interface FormState {
  role_query: string;
  locations: string[];
  posted_within_days: string; // kept as string for the input, parsed on save
  min_score: string;
  notes: string;
}

const EMPTY_FORM: FormState = { role_query: '', locations: [], posted_within_days: '', min_score: '', notes: '' };

// ── Shared styles (matches AI Engine page conventions) ────────
const card = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-5';
const btn  = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';

// ── Reusable tag-chip input (same pattern as the AI Engine's Pattern tab) ──
function TagChips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');

  function add(raw: string) {
    const v = raw.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  }
  function remove(v: string) { onChange(values.filter(x => x !== v)); }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-zinc-700 bg-zinc-950 min-h-[44px]">
      {values.map(v => (
        <span key={v} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-900/40 text-indigo-300 text-xs font-mono">
          {v}
          <button onClick={() => remove(v)} className="text-indigo-500 hover:text-red-400 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); } }}
        placeholder={placeholder || 'Add, then Enter'}
        className="flex-1 min-w-[140px] bg-transparent text-xs text-zinc-300 outline-none placeholder-zinc-600"
      />
    </div>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Discovery tab types
interface BoardSummary { ats_platform: string; count: number; total_yield: number }
interface BoardRow {
  ats_platform: string; board_slug: string; first_discovered_via: string | null;
  last_polled_at: string | null; last_yield_count: number | null; created_at: string;
}
interface IngestionLog {
  id: string; source_api: string; status: string;
  jobs_fetched: number; jobs_new: number; jobs_duplicates: number; jobs_filtered: number;
  duration_ms: number | null; created_at: string;
}

const SCRAPER_SOURCES = ['greenhouse_search', 'lever_search', 'ashby_search', 'linkedin_search'];
const PLATFORM_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', linkedin: 'LinkedIn',
};

function DiscoveryTab() {
  const [summary, setSummary] = useState<BoardSummary[]>([]);
  const [recentBoards, setRecentBoards] = useState<BoardRow[]>([]);
  const [logs, setLogs] = useState<IngestionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [boards, logData] = await Promise.all([
          adminApi.getKnownBoards(),
          adminApi.getIngestionLogs(100),
        ]);
        setSummary(boards.summary);
        setRecentBoards(boards.recent);
        setLogs((logData.data as IngestionLog[]).filter(l => SCRAPER_SOURCES.includes(l.source_api)));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load discovery data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-sm text-red-300">{error}</div>;
  }

  const totalBoards = summary.reduce((n, s) => n + s.count, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Search discovers a company board once; every run afterward polls it directly — free, no search spent.
        This is the self-building registry that makes discovery cost shrink over time.
      </p>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={card}>
          <p className="text-xs text-zinc-500 mb-1">Total known boards</p>
          <p className="text-2xl font-bold text-white">{totalBoards}</p>
        </div>
        {summary.map(s => (
          <div key={s.ats_platform} className={card}>
            <p className="text-xs text-zinc-500 mb-1">{PLATFORM_LABEL[s.ats_platform] || s.ats_platform}</p>
            <p className="text-2xl font-bold text-indigo-300">{s.count}</p>
            <p className="text-xs text-zinc-600 mt-1">{s.total_yield} postings last poll</p>
          </div>
        ))}
      </div>

      {/* Recent ingestion runs */}
      <div className={card}>
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Recent Discovery Runs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">No discovery runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left border-b border-zinc-800">
                  <th className="pb-2 pr-4">Platform</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Fetched</th>
                  <th className="pb-2 pr-4">New</th>
                  <th className="pb-2 pr-4">Dupes</th>
                  <th className="pb-2 pr-4">Filtered</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map(l => (
                  <tr key={l.id} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-2 pr-4">{PLATFORM_LABEL[l.source_api.replace('_search', '')] || l.source_api}</td>
                    <td className="py-2 pr-4">
                      <span className={l.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>{l.status}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{l.jobs_fetched}</td>
                    <td className="py-2 pr-4 font-mono text-emerald-400">{l.jobs_new}</td>
                    <td className="py-2 pr-4 font-mono text-zinc-500">{l.jobs_duplicates}</td>
                    <td className="py-2 pr-4 font-mono text-zinc-500">{l.jobs_filtered}</td>
                    <td className="py-2 pr-4 font-mono">{l.duration_ms ? `${(l.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="py-2 text-zinc-500">{formatWhen(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Known boards */}
      <div className={card}>
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Known Boards (most recently discovered first)</h2>
        {recentBoards.length === 0 ? (
          <p className="text-sm text-zinc-500">No boards discovered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left border-b border-zinc-800">
                  <th className="pb-2 pr-4">Platform</th>
                  <th className="pb-2 pr-4">Board</th>
                  <th className="pb-2 pr-4">Discovered via</th>
                  <th className="pb-2 pr-4">Last polled</th>
                  <th className="pb-2">Last yield</th>
                </tr>
              </thead>
              <tbody>
                {recentBoards.map(b => (
                  <tr key={`${b.ats_platform}-${b.board_slug}`} className="border-b border-zinc-900 text-zinc-300">
                    <td className="py-2 pr-4">{PLATFORM_LABEL[b.ats_platform] || b.ats_platform}</td>
                    <td className="py-2 pr-4 font-mono">{b.board_slug}</td>
                    <td className="py-2 pr-4 text-zinc-500">{b.first_discovered_via || '—'}</td>
                    <td className="py-2 pr-4 text-zinc-500">{formatWhen(b.last_polled_at)}</td>
                    <td className="py-2 font-mono">{b.last_yield_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TargetsPage() {
  const [tab, setTab] = useState<Tab>('targets');
  const [targets, setTargets] = useState<JobTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getJobTargets();
      setTargets(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load targets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(t: JobTarget) {
    setEditingId(t.id);
    setForm({
      role_query: t.role_query,
      locations: t.locations,
      posted_within_days: t.posted_within_days != null ? String(t.posted_within_days) : '',
      min_score: t.min_score != null ? String(t.min_score) : '',
      notes: t.notes || '',
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.role_query.trim()) return;
    setSaving(true);
    try {
      const payload = {
        role_query: form.role_query.trim(),
        locations: form.locations,
        posted_within_days: form.posted_within_days ? Number(form.posted_within_days) : null,
        min_score: form.min_score ? Number(form.min_score) : null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const existing = targets.find(t => t.id === editingId);
        await adminApi.updateJobTarget(editingId, { ...payload, is_active: existing?.is_active ?? true });
      } else {
        await adminApi.createJobTarget(payload);
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save target');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: JobTarget) {
    try {
      await adminApi.updateJobTarget(t.id, {
        role_query: t.role_query,
        locations: t.locations,
        posted_within_days: t.posted_within_days,
        min_score: t.min_score,
        notes: t.notes,
        is_active: !t.is_active,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update target');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this target? Discovery will stop searching for it immediately.')) return;
    try {
      await adminApi.deleteJobTarget(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete target');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Targets</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Define the roles and locations the scraper searches for — this drives search discovery directly, no redeploy needed.
          </p>
        </div>
        {tab === 'targets' && (
          <button onClick={openCreate} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap`}>
            + New Target
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['targets', 'discovery'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${btn} ${tab === t ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
            {t === 'targets' ? 'Targets' : 'Discovery'}
          </button>
        ))}
      </div>

      {tab === 'discovery' && <DiscoveryTab />}

      {tab === 'targets' && (
      <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-sm text-red-300">{error}</div>
      )}

      {/* ── Create/Edit form ──────────────────────────────────── */}
      {formOpen && (
        <div className={`${card} mb-6`}>
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">{editingId ? 'Edit Target' : 'New Target'}</h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Role query</label>
              <input
                value={form.role_query}
                onChange={e => setForm(f => ({ ...f, role_query: e.target.value }))}
                placeholder="DevOps Engineer"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Posted within (days) — blank = no limit</label>
              <input
                type="number"
                min={1}
                value={form.posted_within_days}
                onChange={e => setForm(f => ({ ...f, posted_within_days: e.target.value }))}
                placeholder="7"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-zinc-500 block mb-1">Locations — blank or &quot;Remote&quot; = remote-open (no location constraint)</label>
            <TagChips
              values={form.locations}
              onChange={v => setForm(f => ({ ...f, locations: v }))}
              placeholder="Remote, Berlin, …"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Min score override — blank = use global default</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.min_score}
                onChange={e => setForm(f => ({ ...f, min_score: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.role_query.trim()} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Target'}
            </button>
            <button onClick={() => setFormOpen(false)} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-300`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : targets.length === 0 ? (
        <div className={`${card} text-center py-12`}>
          <p className="text-sm text-zinc-500">No targets yet — add one to start discovery.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {targets.map(t => (
            <div key={t.id} className={card}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-white">{t.role_query}</h3>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${t.is_active ? 'bg-green-900/40 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {t.is_active ? '● Active' : '● Paused'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(t.locations.length ? t.locations : ['Remote-open']).map(loc => (
                      <span key={loc} className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 text-xs font-mono">{loc}</span>
                    ))}
                  </div>
                  {t.notes && <p className="text-xs text-zinc-500 mb-2">{t.notes}</p>}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
                    <span>Posted within: <span className="text-zinc-300 font-mono">{t.posted_within_days ? `${t.posted_within_days}d` : 'Any time'}</span></span>
                    <span>Min score: <span className="text-zinc-300 font-mono">{t.min_score ?? 'default'}</span></span>
                    <span>Boards discovered: <span className="text-zinc-300 font-mono">{t.boards_discovered}</span></span>
                    <span>Last polled: <span className="text-zinc-300 font-mono">{formatWhen(t.last_polled_at)}</span></span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => toggleActive(t)} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5`}>
                    {t.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => openEdit(t)} className={`${btn} bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5`}>
                    Edit
                  </button>
                  <button onClick={() => remove(t.id)} className={`${btn} bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs px-3 py-1.5`}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
