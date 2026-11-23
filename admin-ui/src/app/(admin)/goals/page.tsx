'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';
import { showError } from '@/lib/dialog';

type HealthComponent = {
  key: string; label: string; pts: number; max: number; ok: boolean; detail?: string;
};
type HealthScore = { total: number; label: string; color: string; components: HealthComponent[] };
type VelocityPoint = { week: string; cnt: number };
type AutomationRule = {
  id: number; rule_key: string; rule_name: string; description: string;
  is_enabled: boolean; last_ran_at: string | null;
};
type DashStats = {
  goal: { target: number; this_week: number; pct: number; streak_weeks: number };
  health_score: HealthScore;
  weekly_velocity: VelocityPoint[];
  skills_gap: { skill: string; cnt: number }[];
};

const HEALTH_COLORS: Record<string, { ring: string; text: string }> = {
  green:  { ring: '#4ade80', text: 'var(--t-4ade80)' },
  yellow: { ring: '#fbbf24', text: 'var(--t-fbbf24)' },
  red:    { ring: '#f87171', text: 'var(--t-f87171)' },
};

function HealthRing({ score, color, label }: { score: number; color: string; label: string }) {
  const radius = 56;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const c      = HEALTH_COLORS[color] || HEALTH_COLORS.yellow;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg width="144" height="144" viewBox="0 0 144 144" className="rotate-[-90deg]">
          <circle cx="72" cy="72" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12"/>
          <circle
            cx="72" cy="72" r={radius} fill="none"
            stroke={c.ring} strokeWidth="12"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 8px ${c.ring}60)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color: c.text }}>{score}</span>
          <span className="text-xs" style={{ color: 'var(--t-255-255-255-0_45)' }}>/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color: c.text }}>{label}</span>
    </div>
  );
}

function WeeklyGoalBar({ current, target, pct }: { current: number; target: number; pct: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--t-255-255-255-0_65)' }}>Weekly Goal</span>
        <span className="text-xs" style={{ color: 'var(--t-255-255-255-0_45)' }}>{current} / {target} applications</span>
      </div>
      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--c-255-255-255-0_08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: pct >= 100 ? 'linear-gradient(90deg, var(--c-4ade80), var(--c-22d3ee))' : 'linear-gradient(90deg, var(--c-a855f7), var(--c-ddd6fe))',
            boxShadow: pct >= 100 ? '0 0 12px var(--c-74-222-128-0_4)' : '0 0 8px var(--c-168-85-247-0_4)',
          }}
        />
      </div>
      {pct >= 100 && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--t-4ade80)' }}>Goal achieved this week!</p>
      )}
    </div>
  );
}

function VelocityChart({ data }: { data: VelocityPoint[] }) {
  if (!data?.length) return <p className="text-xs text-center py-6" style={{ color: 'var(--t-255-255-255-0_32)' }}>No data yet</p>;
  const max = Math.max(...data.map(d => d.cnt), 1);

  return (
    <div className="flex items-end gap-1.5 h-24 w-full">
      {data.map((d, i) => {
        const h = Math.round((d.cnt / max) * 100);
        const label = new Date(d.week).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${label}: ${d.cnt} apps`}>
            <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{
                  height: `${h}%`,
                  background: i === data.length - 1
                    ? 'linear-gradient(180deg, #A855F7, #7C3AED)'
                    : 'rgba(168,85,247,0.3)',
                  minHeight: d.cnt > 0 ? '4px' : '0',
                }}
              />
            </div>
            <span className="text-[10px]" style={{ color: 'var(--t-255-255-255-0_32)' }}>{label.split(' ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function GoalsPage() {
  const [stats, setStats]       = useState<DashStats | null>(null);
  const [rules, setRules]       = useState<AutomationRule[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [prefSaved, setPrefSaved] = useState(false);

  // Optimistic: the select changes at once; reverted if the save fails.
  async function savePref(key: 'preferred_reminder_channel' | 'digest_schedule', value: string) {
    const previous = settings[key];
    setSettings(s => ({ ...s, [key]: value }));
    setPrefSaved(false);
    try {
      const updated = await adminApi.updateUserSettings({ [key]: value }) as Record<string, unknown> | null;
      if (updated && typeof updated === 'object') setSettings(s => ({ ...s, ...updated }));
      setPrefSaved(true);
    } catch (err) {
      setSettings(s => ({ ...s, [key]: previous }));
      showError(err, "Couldn't save your notification preference.");
    }
  }
  const [loading, setLoading]   = useState(true);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [runningAuto, setRunningAuto] = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    try {
      const [s, r, us] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.getAutomationRules(),
        adminApi.getUserSettings(),
      ]);
      setStats(s);
      setRules(r.rules || r || []);
      setSettings(us);
      setGoalInput(String(us.weekly_application_goal || 5));
    } catch { setError('Failed to load goals data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveGoal() {
    const n = parseInt(goalInput);
    if (!n || n < 1 || n > 50) { setError('Goal must be between 1 and 50'); return; }
    setSavingGoal(true);
    try {
      await adminApi.updateUserSettings({ weekly_application_goal: n });
      await load();
      showToast('Weekly goal updated!');
    } catch { setError('Failed to save goal'); }
    finally { setSavingGoal(false); }
  }

  async function toggleRule(key: string, enabled: boolean) {
    try {
      await adminApi.toggleAutomationRule(key, enabled);
      setRules(prev => prev.map(r => r.rule_key === key ? { ...r, is_enabled: enabled } : r));
      showToast(`Automation "${key}" ${enabled ? 'enabled' : 'disabled'}`);
    } catch { setError('Failed to update rule'); }
  }

  async function runAutomation() {
    setRunningAuto(true);
    try {
      const result = await adminApi.runAutomation() as { paused?: boolean; total?: number; reminders_created?: number };
      showToast(result?.paused
        ? 'Job search is paused (Not open) — rules did not run'
        : `Automation ran: ${result?.reminders_created ?? result?.total ?? 0} reminders created`);
    } catch { setError('Automation failed'); }
    finally { setRunningAuto(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--t-255-255-255-0_32)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl"
          style={{ background: 'var(--c-168-85-247-0_9)', color: '#fff', backdropFilter: 'blur(12px)' }}
        >
          {toast}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--t-ffffff)' }}>My Goals</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--t-255-255-255-0_45)' }}>Track weekly application goals, automation health, and streaks.</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--c-239-68-68-0_1)', color: 'var(--t-f87171)' }}>
          {error}
        </div>
      )}

      {/* Top row: Health score + Weekly goal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        {/* Health Score Ring */}
        <div
          className="rounded-2xl p-6 flex flex-col items-center gap-4"
          style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--t-ddd6fe)' }}>Job Search Health</p>
          {stats && (
            <HealthRing
              score={stats.health_score.total}
              color={stats.health_score.color}
              label={stats.health_score.label}
            />
          )}
        </div>

        {/* Weekly Goal */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--t-ddd6fe)' }}>Weekly Target</p>
          {stats && (
            <WeeklyGoalBar
              current={stats.goal.this_week}
              target={stats.goal.target}
              pct={stats.goal.pct}
            />
          )}
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1} max={50}
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              className="w-20 px-3 py-2 rounded-xl text-sm text-center"
              style={{ background: 'var(--c-0-0-0-0_22)', border: '1px solid var(--c-168-85-247-0_2)', color: 'var(--t-ffffff)', outline: 'none' }}
            />
            <span className="text-sm" style={{ color: 'var(--t-255-255-255-0_45)' }}>apps/week</span>
            <button
              onClick={saveGoal}
              disabled={savingGoal}
              className="px-3 py-2 rounded-xl text-xs font-medium ml-auto"
              style={{ background: 'var(--c-168-85-247-0_2)', color: 'var(--t-ddd6fe)' }}
            >
              {savingGoal ? '…' : 'Set'}
            </button>
          </div>
          {stats && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--c-0-0-0-0_22)' }}>
              <span className="text-2xl">🔥</span>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--t-ffffff)' }}>{stats.goal.streak_weeks} week{stats.goal.streak_weeks !== 1 ? 's' : ''}</p>
                <p className="text-xs" style={{ color: 'var(--t-255-255-255-0_45)' }}>current streak</p>
              </div>
            </div>
          )}
        </div>

        {/* Skills gap */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-3"
          style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--t-ddd6fe)' }}>Top Missing Skills</p>
          <p className="text-xs" style={{ color: 'var(--t-255-255-255-0_45)' }}>From recent job imports (last 90 days)</p>
          {stats?.skills_gap?.length ? (
            <div className="flex flex-col gap-2 mt-1">
              {stats.skills_gap.map((sg, i) => (
                <div key={sg.skill} className="flex items-center gap-2">
                  <span className="text-xs w-4 text-right shrink-0" style={{ color: 'var(--t-255-255-255-0_32)' }}>#{i + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-0-0-0-0_22)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((sg.cnt / (stats.skills_gap[0]?.cnt || 1)) * 100)}%`,
                        background: 'linear-gradient(90deg, var(--c-a855f7), var(--c-ddd6fe))',
                      }}
                    />
                  </div>
                  <span className="text-xs truncate max-w-24" style={{ color: 'var(--t-255-255-255-0_75)' }}>{sg.skill}</span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--t-255-255-255-0_45)' }}>×{sg.cnt}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs mt-2" style={{ color: 'var(--t-255-255-255-0_32)' }}>No skill data yet</p>
          )}
        </div>
      </div>

      {/* Velocity Chart */}
      <div
        className="rounded-2xl p-6 mb-5"
        style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
      >
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--t-ddd6fe)' }}>Application Velocity (last 8 weeks)</p>
        {stats && <VelocityChart data={stats.weekly_velocity} />}
      </div>

      {/* Health Score Breakdown */}
      {stats?.health_score?.components && (
        <div
          className="rounded-2xl p-6 mb-5"
          style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
        >
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--t-ddd6fe)' }}>Health Score Breakdown</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.health_score.components.map(c => (
              <div
                key={c.key}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{
                  background: c.ok ? 'var(--c-74-222-128-0_05)' : 'var(--c-239-68-68-0_05)',
                  border: `1px solid ${c.ok ? 'var(--c-74-222-128-0_15)' : 'var(--c-239-68-68-0_15)'}`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: c.ok ? 'var(--c-74-222-128-0_15)' : 'var(--c-239-68-68-0_1)' }}
                >
                  {c.ok ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--t-255-255-255-0_92)' }}>{c.label}</p>
                  {c.detail && <p className="text-xs mt-0.5" style={{ color: 'var(--t-255-255-255-0_45)' }}>{c.detail}</p>}
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: c.ok ? 'var(--t-4ade80)' : 'var(--t-255-255-255-0_65)' }}>
                  {c.pts}/{c.max}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Rules */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--c-255-255-255-0_07)', border: '1px solid var(--c-255-255-255-0_1)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--t-ddd6fe)' }}>Automation Rules</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--t-255-255-255-0_45)' }}>Smart reminders triggered automatically. Runs every hour.</p>
          </div>
          <button
            onClick={runAutomation}
            disabled={runningAuto}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium"
            style={{
              background: runningAuto ? 'var(--c-168-85-247-0_2)' : 'var(--c-168-85-247-0_15)',
              color: 'var(--t-ddd6fe)',
              border: '1px solid var(--c-168-85-247-0_25)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={runningAuto ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {runningAuto ? 'Running…' : 'Run Now'}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {rules.map(r => (
            <div
              key={r.rule_key}
              className="flex items-start gap-4 px-4 py-3 rounded-xl"
              style={{
                background: r.is_enabled ? 'var(--c-168-85-247-0_07)' : 'var(--c-0-0-0-0_22)',
                border: `1px solid ${r.is_enabled ? 'var(--c-168-85-247-0_15)' : 'var(--c-168-85-247-0_07)'}`,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: r.is_enabled ? 'var(--t-255-255-255-0_92)' : 'var(--t-255-255-255-0_45)' }}>
                  {r.rule_name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--t-255-255-255-0_32)' }}>{r.description}</p>
                {r.last_ran_at && (
                  <p className="text-xs mt-1" style={{ color: 'var(--t-255-255-255-0_18)' }}>
                    Last run: {new Date(r.last_ran_at).toLocaleString()}
                  </p>
                )}
              </div>
              {/* Toggle */}
              <button
                onClick={() => toggleRule(r.rule_key, !r.is_enabled)}
                className="relative shrink-0 w-11 h-6 rounded-full transition-all duration-200 mt-0.5"
                style={{
                  background: r.is_enabled ? 'var(--c-a855f7)' : 'var(--c-100-116-139-0_3)',
                  boxShadow: r.is_enabled ? '0 0 8px var(--c-168-85-247-0_4)' : 'none',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                  style={{ transform: r.is_enabled ? 'translateX(20px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Notification prefs */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--c-255-255-255-0_08)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--t-255-255-255-0_65)' }}>Notification Preferences</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--t-255-255-255-0_45)' }}>Preferred reminder channel</label>
              <select
                value={(settings.preferred_reminder_channel as string) || 'email'}
                onChange={e => savePref('preferred_reminder_channel', e.target.value)}
                aria-describedby="pref-channel-help"
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--c-0-0-0-0_22)', border: '1px solid var(--c-168-85-247-0_15)', color: 'var(--t-ffffff)', outline: 'none' }}
              >
                <option value="email">Email</option>
                <option value="in_app">In-app only</option>
              </select>
              <p id="pref-channel-help" className="text-xs mt-1.5" style={{ color: 'var(--t-255-255-255-0_38)' }}>
                {(settings.preferred_reminder_channel || 'email') === 'email'
                  ? 'Follow-ups waiting for approval are emailed to you with Send / Edit links.'
                  : 'Follow-ups wait in the Outbox — no approval emails.'}
              </p>
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--t-255-255-255-0_45)' }}>Digest schedule</label>
              <select
                value={(settings.digest_schedule as string) || 'daily'}
                onChange={e => savePref('digest_schedule', e.target.value)}
                aria-describedby="pref-digest-help"
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--c-0-0-0-0_22)', border: '1px solid var(--c-168-85-247-0_15)', color: 'var(--t-ffffff)', outline: 'none' }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="off">Off</option>
              </select>
              <p id="pref-digest-help" className="text-xs mt-1.5" style={{ color: 'var(--t-255-255-255-0_38)' }}>
                Job-match and visitor digests. Daily at 08:00 · weekly on Mondays 08:00 (Paris).
              </p>
            </div>
          </div>
          {prefSaved && <p className="text-xs mt-2" role="status" style={{ color: 'var(--t-4ade80)' }}>Saved ✓</p>}
        </div>
      </div>
    </div>
  );
}
