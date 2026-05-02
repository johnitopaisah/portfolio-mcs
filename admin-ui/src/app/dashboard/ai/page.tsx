'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────
interface AiStatus {
  engine: string;
  llm_enabled: boolean;
  ambiguous_min: number;
  ambiguous_max: number;
  api_keys: { anthropic: boolean; groq: boolean; gemini: boolean };
  last_24h: { total_jobs: string; kept: string; review: string; dropped: string; avg_score: string; max_score: string; min_score: string } | null;
  last_run: string | null;
}

interface TechBoost  { kw: string; pts: number }
interface PatternConfig {
  role_keywords: string[];
  tech_boosts:   TechBoost[];
  penalties:     TechBoost[];
  locations:     string[];
}

interface CalibrationBucket { bucket: string; count: number; pct: number }
interface FeedbackStat      { count: number; avg_score: number }
interface CalibJob          { id: string; title: string; company_name: string; location: string; relevance_score: number; ai_decision: string; ai_reasoning: string }
interface Calibration {
  total_jobs: number;
  score_distribution: CalibrationBucket[];
  feedback_summary: Record<string, FeedbackStat>;
  false_negatives: CalibJob[];
  false_positives: CalibJob[];
}

interface PatternDetail { kw: string; pts: number }
interface TestResult {
  pattern: {
    score: number; decision: string; baseline: number;
    role_matches: string[]; tech_matches: PatternDetail[];
    penalty_matches: PatternDetail[]; location_ok: boolean; location_boost: number; seniority: string;
  };
  llm: { relevance_score: number; ai_decision: string; ai_reasoning: string; tech_stack: string[]; _engine?: string; error?: string } | null;
}

type Tab = 'status' | 'pattern' | 'calibration' | 'tester';

// ── Shared styles ────────────────────────────────────────────
const card  = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-5';
const badge = (ok: boolean) => `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ok ? 'bg-green-900/40 text-green-400' : 'bg-zinc-800 text-zinc-500'}`;
const btn   = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';

// ── Reusable tag-chip input ──────────────────────────────────
function TagChips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');

  function add(raw: string) {
    const v = raw.trim().toLowerCase();
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

// ── Boost/penalty row editor ─────────────────────────────────
function BoostTable({ rows, onChange, negative }: { rows: TechBoost[]; onChange: (v: TechBoost[]) => void; negative?: boolean }) {
  function update(i: number, field: keyof TechBoost, value: string | number) {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
    onChange(next);
  }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function add() { onChange([...rows, { kw: '', pts: negative ? -10 : 3 }]); }

  const colour = negative ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_80px_32px] gap-2 text-xs text-zinc-500 px-1">
        <span>Keyword</span><span className="text-center">Points</span><span/>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2 items-center">
          <input
            value={row.kw}
            onChange={e => update(i, 'kw', e.target.value)}
            placeholder="keyword"
            className="px-2 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-indigo-500"
          />
          <input
            type="number"
            value={row.pts}
            onChange={e => update(i, 'pts', parseInt(e.target.value, 10) || 0)}
            className={`px-2 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-center outline-none focus:border-indigo-500 ${colour}`}
          />
          <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-indigo-400 hover:text-indigo-300 mt-1">+ Add row</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AiManagementPage() {
  const [tab, setTab] = useState<Tab>('status');

  // ── Status tab ───────────────────────────────────────────────
  const [status,       setStatus]       = useState<AiStatus | null>(null);
  const [statusLoad,   setStatusLoad]   = useState(true);
  const [engineForm,   setEngineForm]   = useState({ engine: 'pattern', llm_enabled: false, ambiguous_min: 30, ambiguous_max: 72 });
  const [savingEngine, setSavingEngine] = useState(false);
  const [engineMsg,    setEngineMsg]    = useState('');

  // ── Pattern tab ──────────────────────────────────────────────
  const [pattern,       setPattern]       = useState<PatternConfig | null>(null);
  const [patternLoad,   setPatternLoad]   = useState(false);
  const [patternDraft,  setPatternDraft]  = useState<PatternConfig | null>(null);
  const [savingPattern, setSavingPattern] = useState(false);
  const [patternMsg,    setPatternMsg]    = useState('');

  // ── Calibration tab ──────────────────────────────────────────
  const [calib,      setCalib]      = useState<Calibration | null>(null);
  const [calibLoad,  setCalibLoad]  = useState(false);

  // ── Tester tab ───────────────────────────────────────────────
  const [testJob,  setTestJob]  = useState({ title: '', company_name: '', location: '', description: '', requirements: '' });
  const [testRes,  setTestRes]  = useState<TestResult | null>(null);
  const [testLoad, setTestLoad] = useState(false);

  // ── Load status ──────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setStatusLoad(true);
    try {
      const s = await adminApi.getAiStatus() as AiStatus;
      setStatus(s);
      setEngineForm({
        engine:        s.engine,
        llm_enabled:   s.llm_enabled,
        ambiguous_min: s.ambiguous_min,
        ambiguous_max: s.ambiguous_max,
      });
    } catch (e) { console.error('AI status load failed:', e); }
    finally { setStatusLoad(false); }
  }, []);

  // ── Load pattern config ──────────────────────────────────────
  const loadPattern = useCallback(async () => {
    setPatternLoad(true);
    try {
      const cfg = await adminApi.getAiPatternConfig() as PatternConfig;
      setPattern(cfg);
      setPatternDraft(JSON.parse(JSON.stringify(cfg))); // deep clone for editing
    } catch (e) { console.error('Pattern config load failed:', e); }
    finally { setPatternLoad(false); }
  }, []);

  // ── Load calibration data ────────────────────────────────────
  const loadCalib = useCallback(async () => {
    setCalibLoad(true);
    try {
      const c = await adminApi.getAiCalibration() as Calibration;
      setCalib(c);
    } catch (e) { console.error('Calibration load failed:', e); }
    finally { setCalibLoad(false); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (tab === 'pattern' && !pattern) loadPattern();
    if (tab === 'calibration' && !calib) loadCalib();
  }, [tab, pattern, calib, loadPattern, loadCalib]);

  // ── Save engine settings ─────────────────────────────────────
  async function saveEngineSettings() {
    setSavingEngine(true);
    try {
      await adminApi.saveAiStatus(engineForm as Record<string, unknown>);
      setEngineMsg('Saved');
      await loadStatus();
    } catch (e) { setEngineMsg(`Error: ${(e as Error).message}`); }
    finally {
      setSavingEngine(false);
      setTimeout(() => setEngineMsg(''), 3000);
    }
  }

  // ── Save pattern config ──────────────────────────────────────
  async function savePattern() {
    if (!patternDraft) return;
    setSavingPattern(true);
    try {
      await adminApi.saveAiPatternConfig(patternDraft as unknown as Record<string, unknown>);
      setPattern(JSON.parse(JSON.stringify(patternDraft)));
      setPatternMsg('Saved');
    } catch (e) { setPatternMsg(`Error: ${(e as Error).message}`); }
    finally {
      setSavingPattern(false);
      setTimeout(() => setPatternMsg(''), 3000);
    }
  }

  // ── Run test score ───────────────────────────────────────────
  async function runTestScore() {
    if (!testJob.title) return;
    setTestLoad(true); setTestRes(null);
    try {
      const r = await adminApi.testAiScore(testJob) as TestResult;
      setTestRes(r);
    } catch (e) { alert((e as Error).message); }
    finally { setTestLoad(false); }
  }

  // ── Helpers ──────────────────────────────────────────────────
  const tabBtn = (t: Tab) =>
    `${btn} ${tab === t ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`;

  const decisionColour = (d: string) =>
    d === 'KEEP' ? '#22c55e' : d === 'REVIEW' ? '#eab308' : '#ef4444';

  const scoreColour = (s: number) =>
    s >= 75 ? '#22c55e' : s >= 50 ? '#eab308' : '#ef4444';

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">AI Engine</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure scoring, edit pattern keywords, calibrate, and live-test</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(['status', 'pattern', 'calibration', 'tester'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={tabBtn(t)}>
            {t === 'status'      ? 'Engine Status'
             : t === 'pattern'   ? 'Pattern Editor'
             : t === 'calibration' ? 'Calibration'
             : 'Live Tester'}
          </button>
        ))}
      </div>

      {/* ══ STATUS TAB ════════════════════════════════════════ */}
      {tab === 'status' && (
        <div className="space-y-6">
          {statusLoad ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : status ? (
            <>
              {/* Engine health card */}
              <div className={card}>
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">Active Configuration</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Engine</p>
                    <p className="text-sm font-bold text-indigo-300 uppercase">{status.engine}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">LLM scoring</p>
                    <span className={badge(status.llm_enabled)}>
                      {status.llm_enabled ? '● Active' : '● Off'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Ambiguous range</p>
                    <p className="text-sm font-mono text-zinc-300">{status.ambiguous_min}–{status.ambiguous_max}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Last run</p>
                    <p className="text-xs text-zinc-400">
                      {status.last_run ? new Date(status.last_run).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </p>
                  </div>
                </div>

                {/* API key status */}
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-2">API Keys</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={badge(status.api_keys.groq)}>Groq {status.api_keys.groq ? 'set' : 'missing'}</span>
                    <span className={badge(status.api_keys.anthropic)}>Anthropic {status.api_keys.anthropic ? 'set' : 'missing'}</span>
                    <span className={badge(status.api_keys.gemini)}>Gemini {status.api_keys.gemini ? 'set' : 'missing'}</span>
                  </div>
                  {!status.api_keys.groq && !status.api_keys.anthropic && !status.api_keys.gemini && (
                    <p className="text-xs text-amber-500 mt-2">No LLM API key detected — scoring runs pattern-only (free). Add GROQ_API_KEY to Infisical for free Llama 70B scoring.</p>
                  )}
                </div>
              </div>

              {/* 24h stats */}
              {status.last_24h && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Total (24h)',  value: status.last_24h.total_jobs ?? '—', colour: '#a78bfa' },
                    { label: 'Kept',         value: status.last_24h.kept       ?? '—', colour: '#22c55e' },
                    { label: 'Review',       value: status.last_24h.review     ?? '—', colour: '#eab308' },
                    { label: 'Dropped',      value: status.last_24h.dropped    ?? '—', colour: '#ef4444' },
                    { label: 'Avg score',    value: status.last_24h.avg_score  ?? '—', colour: '#06b6d4' },
                    { label: 'Top score',    value: status.last_24h.max_score  ?? '—', colour: '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} className={`${card} text-center`}>
                      <div className="text-xl font-bold mb-0.5" style={{ color: s.colour }}>{s.value}</div>
                      <div className="text-xs text-zinc-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Engine settings editor */}
              <div className={card}>
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">Engine Settings</h2>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1.5">AI Engine</label>
                    <select
                      value={engineForm.engine}
                      onChange={e => setEngineForm(f => ({ ...f, engine: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500">
                      <option value="pattern">Pattern only (free, no API key)</option>
                      <option value="groq">Groq — Llama 3.3 70B (free tier)</option>
                      <option value="claude">Claude Haiku (paid, ~$1.70/month)</option>
                      <option value="gemini">Gemini 2.0 Flash (free tier)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <button
                      onClick={() => setEngineForm(f => ({ ...f, llm_enabled: !f.llm_enabled }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${engineForm.llm_enabled ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${engineForm.llm_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <label className="text-sm text-zinc-300">Enable LLM scoring (Tier 2)</label>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1.5">
                      Ambiguous zone min: <span className="text-zinc-300 font-mono">{engineForm.ambiguous_min}</span>
                    </label>
                    <input type="range" min={0} max={100} value={engineForm.ambiguous_min}
                      onChange={e => setEngineForm(f => ({ ...f, ambiguous_min: +e.target.value }))}
                      className="w-full accent-indigo-500" />
                    <p className="text-xs text-zinc-600 mt-1">Jobs scoring above this get LLM review</p>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1.5">
                      Ambiguous zone max: <span className="text-zinc-300 font-mono">{engineForm.ambiguous_max}</span>
                    </label>
                    <input type="range" min={0} max={100} value={engineForm.ambiguous_max}
                      onChange={e => setEngineForm(f => ({ ...f, ambiguous_max: +e.target.value }))}
                      className="w-full accent-indigo-500" />
                    <p className="text-xs text-zinc-600 mt-1">Jobs scoring below this get LLM review</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button onClick={saveEngineSettings} disabled={savingEngine}
                    className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
                    {savingEngine ? 'Saving…' : 'Save Engine Settings'}
                  </button>
                  {engineMsg && (
                    <span className={`text-sm ${engineMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{engineMsg}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={`${card} text-center py-12 text-zinc-600`}>Failed to load AI status.</div>
          )}
        </div>
      )}

      {/* ══ PATTERN EDITOR TAB ════════════════════════════════ */}
      {tab === 'pattern' && (
        <div className="space-y-6">
          {patternLoad ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : patternDraft ? (
            <>
              <p className="text-sm text-zinc-500">
                These arrays are stored in the database — no redeploy needed. Empty arrays fall back to hardcoded defaults.
              </p>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Role keywords */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">Role Keywords</h2>
                  <p className="text-xs text-zinc-600 mb-3">Each match adds +4 points. Case-insensitive.</p>
                  <TagChips
                    values={patternDraft.role_keywords}
                    onChange={v => setPatternDraft(d => d ? { ...d, role_keywords: v } : d)}
                    placeholder="e.g. devops, sre — then Enter"
                  />
                </div>

                {/* Accepted locations */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">Accepted Locations</h2>
                  <p className="text-xs text-zinc-600 mb-3">Location match adds +8 points. Miss with zero role hits: -15.</p>
                  <TagChips
                    values={patternDraft.locations}
                    onChange={v => setPatternDraft(d => d ? { ...d, locations: v } : d)}
                    placeholder="e.g. remote, france — then Enter"
                  />
                </div>

                {/* Tech boosts */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">Tech Boosts</h2>
                  <p className="text-xs text-zinc-600 mb-3">Each keyword match adds the specified points.</p>
                  <BoostTable
                    rows={patternDraft.tech_boosts}
                    onChange={v => setPatternDraft(d => d ? { ...d, tech_boosts: v } : d)}
                  />
                </div>

                {/* Penalties */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">Penalties</h2>
                  <p className="text-xs text-zinc-600 mb-3">Use negative values. Applied when keyword is found.</p>
                  <BoostTable
                    rows={patternDraft.penalties}
                    onChange={v => setPatternDraft(d => d ? { ...d, penalties: v } : d)}
                    negative
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={savePattern} disabled={savingPattern}
                  className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
                  {savingPattern ? 'Saving…' : 'Save Pattern Config'}
                </button>
                <button onClick={loadPattern}
                  className={`${btn} border border-zinc-700 text-zinc-400 hover:text-white`}>
                  Reset to Saved
                </button>
                {patternMsg && (
                  <span className={`text-sm ${patternMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{patternMsg}</span>
                )}
              </div>
            </>
          ) : (
            <div className={`${card} text-center py-12`}>
              <button onClick={loadPattern} className={`${btn} bg-indigo-600 text-white`}>Load Pattern Config</button>
            </div>
          )}
        </div>
      )}

      {/* ══ CALIBRATION TAB ═══════════════════════════════════ */}
      {tab === 'calibration' && (
        <div className="space-y-6">
          {calibLoad ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : calib ? (
            <>
              {/* Score distribution */}
              <div className={card}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-300">Score Distribution</h2>
                    <p className="text-xs text-zinc-500">{calib.total_jobs} total jobs</p>
                  </div>
                  <button onClick={loadCalib} className="text-xs text-zinc-500 hover:text-zinc-300">↻ Refresh</button>
                </div>
                <div className="space-y-1.5">
                  {calib.score_distribution.map(b => (
                    <div key={b.bucket} className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-zinc-500 w-14 flex-shrink-0">{b.bucket}</span>
                      <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{
                            width: `${b.pct}%`,
                            background: parseInt(b.bucket) >= 70 ? '#22c55e' : parseInt(b.bucket) >= 40 ? '#eab308' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-zinc-400 w-8 text-right">{b.count}</span>
                      <span className="text-zinc-600 w-8 text-right">{b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback summary */}
              {Object.keys(calib.feedback_summary).length > 0 && (
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-3">Your Feedback</h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {Object.entries(calib.feedback_summary).map(([action, stat]) => (
                      <div key={action} className="text-center p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                        <p className="text-xs text-zinc-500 mb-1 capitalize">{action}</p>
                        <p className="text-xl font-bold text-zinc-200">{stat.count}</p>
                        <p className="text-xs text-zinc-500">avg score <span className="text-zinc-300">{stat.avg_score}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-6">
                {/* False negatives */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">False Negatives</h2>
                  <p className="text-xs text-zinc-600 mb-3">Jobs you applied to that scored below 65 — AI under-scored these.</p>
                  {calib.false_negatives.length === 0 ? (
                    <p className="text-xs text-zinc-600">None found.</p>
                  ) : (
                    <div className="space-y-2">
                      {calib.false_negatives.map(j => (
                        <div key={j.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-zinc-800/60">
                          <div className="min-w-0">
                            <p className="text-zinc-300 truncate">{j.title}</p>
                            <p className="text-zinc-600">{j.company_name}</p>
                          </div>
                          <span className="font-mono font-bold flex-shrink-0" style={{ color: scoreColour(j.relevance_score) }}>{j.relevance_score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* False positives */}
                <div className={card}>
                  <h2 className="text-sm font-semibold text-zinc-300 mb-1">False Positives</h2>
                  <p className="text-xs text-zinc-600 mb-3">Jobs you skipped that scored 65+ — AI over-scored these.</p>
                  {calib.false_positives.length === 0 ? (
                    <p className="text-xs text-zinc-600">None found.</p>
                  ) : (
                    <div className="space-y-2">
                      {calib.false_positives.map(j => (
                        <div key={j.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-zinc-800/60">
                          <div className="min-w-0">
                            <p className="text-zinc-300 truncate">{j.title}</p>
                            <p className="text-zinc-600">{j.company_name}</p>
                          </div>
                          <span className="font-mono font-bold flex-shrink-0" style={{ color: scoreColour(j.relevance_score) }}>{j.relevance_score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={`${card} text-center py-12`}>
              <button onClick={loadCalib} className={`${btn} bg-indigo-600 text-white`}>Load Calibration Data</button>
            </div>
          )}
        </div>
      )}

      {/* ══ LIVE TESTER TAB ════════════════════════════════════ */}
      {tab === 'tester' && (
        <div className="space-y-6">
          <p className="text-sm text-zinc-500">Paste a job description and see exactly how the scorer evaluates it — pattern breakdown plus optional LLM score.</p>

          {/* Input form */}
          <div className={card}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Job Details</h2>
            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              {(['title', 'company_name', 'location'] as const).map(field => (
                <div key={field}>
                  <label className="text-xs text-zinc-500 block mb-1 capitalize">{field.replace('_', ' ')}</label>
                  <input
                    value={testJob[field]}
                    onChange={e => setTestJob(j => ({ ...j, [field]: e.target.value }))}
                    placeholder={field === 'title' ? 'Senior DevOps Engineer' : field === 'company_name' ? 'ACME Corp' : 'Remote, Europe'}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              {(['description', 'requirements'] as const).map(field => (
                <div key={field}>
                  <label className="text-xs text-zinc-500 block mb-1 capitalize">{field}</label>
                  <textarea
                    rows={6}
                    value={testJob[field]}
                    onChange={e => setTestJob(j => ({ ...j, [field]: e.target.value }))}
                    placeholder={`Paste ${field} text here…`}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 outline-none focus:border-indigo-500 resize-y font-mono text-xs"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={runTestScore}
              disabled={testLoad || !testJob.title}
              className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
              {testLoad ? 'Scoring…' : 'Score This Job'}
            </button>
          </div>

          {/* Results */}
          {testRes && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Pattern result */}
              <div className={card}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300">Pattern Score</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold" style={{ color: scoreColour(testRes.pattern.score) }}>{testRes.pattern.score}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${decisionColour(testRes.pattern.decision)}20`, color: decisionColour(testRes.pattern.decision) }}>
                      {testRes.pattern.decision}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Baseline</span>
                    <span className="font-mono text-zinc-400">+{testRes.pattern.baseline}</span>
                  </div>

                  {testRes.pattern.role_matches.length > 0 && (
                    <div>
                      <p className="text-zinc-500 mb-1">Role keywords matched ({testRes.pattern.role_matches.length} × +4)</p>
                      <div className="flex flex-wrap gap-1">
                        {testRes.pattern.role_matches.map(kw => (
                          <span key={kw} className="px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 font-mono">{kw} +4</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testRes.pattern.tech_matches.length > 0 && (
                    <div>
                      <p className="text-zinc-500 mb-1">Tech boosts</p>
                      <div className="flex flex-wrap gap-1">
                        {testRes.pattern.tech_matches.map(({ kw, pts }) => (
                          <span key={kw} className="px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 font-mono">{kw} +{pts}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {testRes.pattern.penalty_matches.length > 0 && (
                    <div>
                      <p className="text-zinc-500 mb-1">Penalties</p>
                      <div className="flex flex-wrap gap-1">
                        {testRes.pattern.penalty_matches.map(({ kw, pts }) => (
                          <span key={kw} className="px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 font-mono">{kw} {pts}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-1 border-t border-zinc-800">
                    <span className="text-zinc-500">Location ({testRes.pattern.location_ok ? 'accepted' : 'not accepted'})</span>
                    <span className={`font-mono ${testRes.pattern.location_boost >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {testRes.pattern.location_boost >= 0 ? '+' : ''}{testRes.pattern.location_boost}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-zinc-500">Seniority detected</span>
                    <span className="text-zinc-300">{testRes.pattern.seniority}</span>
                  </div>
                </div>
              </div>

              {/* LLM result */}
              <div className={card}>
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">LLM Score</h2>
                {testRes.llm === null ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-zinc-600">LLM scoring is disabled or no API key is set.</p>
                    <p className="text-xs text-zinc-700 mt-1">Enable it in the Engine Status tab.</p>
                  </div>
                ) : testRes.llm.error ? (
                  <p className="text-sm text-red-400">{testRes.llm.error}</p>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold" style={{ color: scoreColour(testRes.llm.relevance_score) }}>
                        {testRes.llm.relevance_score}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${decisionColour(testRes.llm.ai_decision)}20`, color: decisionColour(testRes.llm.ai_decision) }}>
                        {testRes.llm.ai_decision}
                      </span>
                      {testRes.llm._engine && (
                        <span className="text-zinc-600 font-mono">{testRes.llm._engine}</span>
                      )}
                    </div>

                    {testRes.llm.ai_reasoning && (
                      <p className="text-zinc-400 italic">{testRes.llm.ai_reasoning}</p>
                    )}

                    {(testRes.llm.tech_stack || []).length > 0 && (
                      <div>
                        <p className="text-zinc-500 mb-1">Tech stack identified</p>
                        <div className="flex flex-wrap gap-1">
                          {testRes.llm.tech_stack.map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
