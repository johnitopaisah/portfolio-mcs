'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

// Fast path for applications made outside this dashboard (direct on a
// company site, LinkedIn Easy Apply, a recruiter DM, etc.) — no job
// description to paste, no AI parse, just enough to log it as Applied
// right now so it counts toward the weekly goal immediately instead of
// waiting for a reply email to eventually surface it.
const PLATFORMS = [
  { value: 'linkedin',        label: 'LinkedIn' },
  { value: 'indeed',          label: 'Indeed' },
  { value: 'glassdoor',       label: 'Glassdoor' },
  { value: 'seek',            label: 'Seek' },
  { value: 'otta',            label: 'Otta' },
  { value: 'remoteok',        label: 'RemoteOK' },
  { value: 'weworkremotely',  label: 'We Work Remotely' },
  { value: 'wellfound',       label: 'Wellfound' },
  { value: 'monster',         label: 'Monster' },
  { value: 'ziprecruiter',    label: 'ZipRecruiter' },
  { value: 'company_website', label: 'Company Website' },
  { value: 'recruiter_email', label: 'Recruiter Email' },
  { value: 'referral',        label: 'Referral' },
  { value: 'job_fair',        label: 'Job Fair' },
  { value: 'other',           label: 'Other' },
];

export default function QuickLogDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [companyName,  setCompanyName]  = useState('');
  const [jobTitle,     setJobTitle]     = useState('');
  const [platform,     setPlatform]     = useState('');
  const [applyUrl,     setApplyUrl]     = useState('');
  const [referralFrom, setReferralFrom] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState<{ id: number } | null>(null);

  const canSubmit = companyName.trim().length > 0 && jobTitle.trim().length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const importResult = await adminApi.importJob({
        job: {
          title:        jobTitle.trim(),
          company_name: companyName.trim(),
          apply_url:    applyUrl.trim() || undefined,
        },
        sourcePlatform:     platform || 'other',
        sourceUrl:          applyUrl.trim() || undefined,
        entryMethod:        'manual',
        createApplication:  true,
        referralFrom:       referralFrom.trim() || undefined,
      }) as { application: { id: number } };

      const appId = importResult.application.id;
      await adminApi.patchApplicationStatus(appId, 'APPLIED', 'Quick-logged — applied outside the dashboard');
      setResult({ id: appId });
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to log application');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-bold text-lg">Quick Log</h2>
            <p className="text-gray-500 text-xs mt-0.5">Already applied elsewhere? Log it in a few seconds — no paste needed.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {result ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-900/40 border-2 border-green-600 flex items-center justify-center text-2xl">✓</div>
              <div>
                <h3 className="text-white font-bold text-lg">Logged</h3>
                <p className="text-gray-400 text-sm mt-1">Marked as Applied — counts toward this week&apos;s goal now.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onClose(); router.push(`/applications/${result.id}`); }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                  View Application →
                </button>
                <button
                  onClick={() => { setResult(null); setCompanyName(''); setJobTitle(''); setPlatform(''); setApplyUrl(''); setReferralFrom(''); }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                  Log another
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Company *</label>
                <input
                  value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus
                  placeholder="e.g. Acme Inc"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Job Title *</label>
                <input
                  value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. DevOps Engineer"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Where did you apply?</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => (
                    <button key={p.value} type="button" onClick={() => setPlatform(p.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                        ${platform === p.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {platform === 'referral' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Referred by</label>
                  <input
                    value={referralFrom} onChange={e => setReferralFrom(e.target.value)}
                    placeholder="Name or contact of the person who referred you"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Job / Apply URL <span className="font-normal text-gray-600">(optional)</span>
                </label>
                <input
                  value={applyUrl} onChange={e => setApplyUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">{error}</div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-800">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed
                text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2">
              {saving ? <><span className="animate-spin">⟳</span> Logging…</> : 'Log as Applied'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
