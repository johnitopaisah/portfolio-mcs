'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────
interface ParsedJob {
  title: string;
  company_name: string;
  location: string;
  work_arrangement: string;
  job_type: string;
  seniority_level: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  visa_sponsorship: boolean | null;
  apply_url: string | null;
  role_summary: string;
  description_clean: string;
  requirements_text: string;
  tech_stack: string[];
  required_skills: string[];
  nice_to_have: string[];
  soft_skills: string[];
  certifications_req: string[];
  languages_required: string[];
  red_flags: string[];
  company_stage: string;
  team_size_hint: string | null;
  reporting_to: string | null;
  relevance_score: number;
  ai_decision: string;
  ai_reasoning: string;
  matched_skills: string[];
  missing_skills: string[];
  strongest_angle: string;
  cover_letter_hook: string;
  suggested_sections: string[];
  suggested_hints: string[];
  recommended_template: string;
  recommended_tone: string;
  detected_platform: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { value: 'linkedin',          label: 'LinkedIn' },
  { value: 'indeed',            label: 'Indeed' },
  { value: 'glassdoor',         label: 'Glassdoor' },
  { value: 'seek',              label: 'Seek' },
  { value: 'otta',              label: 'Otta' },
  { value: 'remoteok',          label: 'RemoteOK' },
  { value: 'weworkremotely',    label: 'We Work Remotely' },
  { value: 'wellfound',         label: 'Wellfound' },
  { value: 'monster',           label: 'Monster' },
  { value: 'ziprecruiter',      label: 'ZipRecruiter' },
  { value: 'company_website',   label: 'Company Website' },
  { value: 'recruiter_email',   label: 'Recruiter Email' },
  { value: 'referral',          label: 'Referral' },
  { value: 'job_fair',          label: 'Job Fair' },
  { value: 'other',             label: 'Other' },
];

const SECTIONS_OPTIONS = ['summary', 'skills', 'experience', 'education', 'certifications', 'projects', 'references'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreBg(score: number) {
  if (score >= 75) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-red-400';
}
function decisionBadge(d: string) {
  if (d === 'KEEP')   return 'bg-green-900/50 text-green-300 border border-green-700/50';
  if (d === 'REVIEW') return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50';
  return                     'bg-red-900/50 text-red-300 border border-red-700/50';
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ImportJobDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [platform,     setPlatform]     = useState('');
  const [sourceUrl,    setSourceUrl]    = useState('');
  const [rawText,      setRawText]      = useState('');
  const [referralFrom, setReferralFrom] = useState('');
  const [parsing,      setParsing]      = useState(false);
  const [parseError,   setParseError]   = useState('');

  // Step 2 — editable parsed data
  const [parsed, setParsed] = useState<ParsedJob | null>(null);

  // Step 3 — generation options
  const [genCv,       setGenCv]       = useState(true);
  const [genCl,       setGenCl]       = useState(true);
  const [sections,    setSections]    = useState<string[]>([]);
  const [hints,       setHints]       = useState<string[]>([]);
  const [hintInput,   setHintInput]   = useState('');
  const [templateId,  setTemplateId]  = useState('classic');
  const [accentColor, setAccentColor] = useState('#2563EB');
  const [tone,        setTone]        = useState('professional');

  // Step 4 — result
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState('');
  const [result,    setResult]    = useState<{ application: { id: number } } | null>(null);
  const [generating, setGenerating] = useState(false);

  // ── Step 1: parse ────────────────────────────────────────────
  async function handleParse() {
    if (rawText.trim().length < 50) { setParseError('Please paste more text — at least 50 characters'); return; }
    setParsing(true);
    setParseError('');
    try {
      const data = await adminApi.parseJob(rawText.trim(), sourceUrl || undefined);
      setParsed(data as ParsedJob);
      // Pre-fill generation options from AI suggestions
      setSections(data.suggested_sections?.length ? data.suggested_sections : ['summary', 'skills', 'experience', 'education', 'certifications']);
      setHints(data.suggested_hints || []);
      setTemplateId(data.recommended_template || 'classic');
      setTone(data.recommended_tone || 'professional');
      if (data.detected_platform && !platform) setPlatform(data.detected_platform);
      setStep(2);
    } catch (err: unknown) {
      setParseError((err as Error).message || 'Failed to parse');
    } finally {
      setParsing(false);
    }
  }

  // ── Step 3: import + optional generate ───────────────────────
  async function handleImportAndGenerate() {
    if (!parsed) return;
    setImporting(true);
    setImportErr('');
    try {
      const importResult = await adminApi.importJob({
        job: { ...parsed, _rawText: rawText } as unknown as Record<string, unknown>,
        sourcePlatform: platform || parsed.detected_platform || 'other',
        sourceUrl:      sourceUrl || undefined,
        entryMethod:    'paste',
        createApplication: true,
        referralFrom:   referralFrom || undefined,
      }) as { application: { id: number } };

      setResult(importResult);
      setStep(4);

      if ((genCv || genCl) && importResult.application) {
        setGenerating(true);
        try {
          await adminApi.generateBundle(importResult.application.id, {
            sections, userHints: hints.join('. '), templateId, accentColor, tone,
            generateCl: genCl, force: true,
          });
        } catch { /* non-fatal — user can generate from detail page */ }
        setGenerating(false);
      }
    } catch (err: unknown) {
      setImportErr((err as Error).message || 'Import failed');
      setImporting(false);
    }
  }

  async function handleSaveOnly() {
    if (!parsed) return;
    setImporting(true);
    setImportErr('');
    try {
      const importResult = await adminApi.importJob({
        job: { ...parsed, _rawText: rawText } as unknown as Record<string, unknown>,
        sourcePlatform: platform || parsed.detected_platform || 'other',
        sourceUrl:      sourceUrl || undefined,
        entryMethod:    'paste',
        createApplication: true,
        referralFrom:   referralFrom || undefined,
      }) as { application: { id: number } };
      setResult(importResult);
      setStep(4);
    } catch (err: unknown) {
      setImportErr((err as Error).message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleSection(s: string) {
    setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }
  function addHint() {
    if (hintInput.trim() && !hints.includes(hintInput.trim())) {
      setHints(prev => [...prev, hintInput.trim()]);
    }
    setHintInput('');
  }
  function removeHint(h: string) { setHints(prev => prev.filter(x => x !== h)); }

  // ── Chip helper ──────────────────────────────────────────────
  function Chips({ items, onRemove }: { items: string[]; onRemove?: (s: string) => void }) {
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map(s => (
          <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-300">
            {s}
            {onRemove && (
              <button onClick={() => onRemove(s)} className="text-gray-500 hover:text-red-400 leading-none">&times;</button>
            )}
          </span>
        ))}
      </div>
    );
  }

  // ── Stepper header ───────────────────────────────────────────
  const steps = ['Source', 'Parse', 'Review & Confirm', 'Generate'];

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-bold text-lg">Import Job</h2>
            <p className="text-gray-500 text-xs mt-0.5">Paste from any job site — AI will extract and analyse it</p>
          </div>
          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-1 mr-8">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${step > i + 1 ? 'bg-green-600 text-white' : step === i + 1 ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className={`text-xs hidden md:block ${step === i + 1 ? 'text-white' : 'text-gray-600'}`}>{label}</span>
                {i < steps.length - 1 && <div className="w-6 h-px bg-gray-700 mx-1" />}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Source + Paste ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Where did you find this job?</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => (
                    <button key={p.value}
                      onClick={() => setPlatform(p.value)}
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
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Job URL <span className="font-normal text-gray-600">(optional — for reference)</span></label>
                <input
                  value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Paste the full job posting
                  <span className="font-normal text-gray-600 ml-2">— select all text on the job page and paste here</span>
                </label>
                <textarea
                  value={rawText} onChange={e => setRawText(e.target.value)}
                  rows={12}
                  placeholder="Paste everything — job title, company, description, requirements, salary... don't worry about formatting"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600
                    focus:outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed"
                />
                <p className="text-xs text-gray-600 mt-1">{rawText.length} characters</p>
              </div>

              {parseError && (
                <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">{parseError}</div>
              )}
            </div>
          )}

          {/* ── Step 2: Review extracted data ── */}
          {step === 2 && parsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: editable fields */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Job Details — edit if needed</h3>

                {[
                  { label: 'Job Title',    key: 'title' },
                  { label: 'Company',      key: 'company_name' },
                  { label: 'Location',     key: 'location' },
                  { label: 'Apply URL',    key: 'apply_url' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input
                      value={(parsed as unknown as Record<string, unknown>)[key] as string || ''}
                      onChange={e => setParsed(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Work Arrangement</label>
                    <select value={parsed.work_arrangement}
                      onChange={e => setParsed(p => p ? { ...p, work_arrangement: e.target.value } : p)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      {['remote','hybrid','onsite','unclear'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Job Type</label>
                    <select value={parsed.job_type}
                      onChange={e => setParsed(p => p ? { ...p, job_type: e.target.value } : p)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                      {['full-time','part-time','contract','freelance','internship','unclear'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Min Salary', key: 'salary_min', type: 'number' },
                    { label: 'Max Salary', key: 'salary_max', type: 'number' },
                    { label: 'Currency',   key: 'salary_currency', type: 'text' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type={type}
                        value={(parsed as unknown as Record<string, unknown>)[key] as string || ''}
                        onChange={e => setParsed(p => p ? { ...p, [key]: e.target.value || null } : p)}
                        placeholder={key === 'salary_currency' ? 'USD' : '—'}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tech Stack <span className="text-gray-600">(click to remove)</span></label>
                  <Chips items={parsed.tech_stack} onRemove={s => setParsed(p => p ? { ...p, tech_stack: p.tech_stack.filter(x => x !== s) } : p)} />
                </div>

                {parsed.red_flags.length > 0 && (
                  <div>
                    <label className="block text-xs text-yellow-600 mb-1">⚠ Red Flags detected by AI</label>
                    <div className="space-y-1">
                      {parsed.red_flags.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/30 px-3 py-2 rounded-lg">
                          <span>⚠</span>
                          <span>{f}</span>
                          <button onClick={() => setParsed(p => p ? { ...p, red_flags: p.red_flags.filter((_, j) => j !== i) } : p)}
                            className="ml-auto text-yellow-700 hover:text-yellow-400">&times;</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: AI analysis */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">AI Match Analysis</h3>

                <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-4xl font-black ${scoreBg(parsed.relevance_score)}`}>{parsed.relevance_score}</div>
                      <div className="text-xs text-gray-500">match score</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${decisionBadge(parsed.ai_decision)}`}>
                      {parsed.ai_decision}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">{parsed.ai_reasoning}</p>
                </div>

                {parsed.strongest_angle && (
                  <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-xl p-3">
                    <div className="text-xs text-indigo-400 font-semibold mb-1">Strongest angle</div>
                    <p className="text-sm text-indigo-200">{parsed.strongest_angle}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {parsed.matched_skills.length > 0 && (
                    <div>
                      <div className="text-xs text-green-400 font-semibold mb-1">You have ({parsed.matched_skills.length})</div>
                      <Chips items={parsed.matched_skills.slice(0, 8)} />
                    </div>
                  )}
                  {parsed.missing_skills.length > 0 && (
                    <div>
                      <div className="text-xs text-red-400 font-semibold mb-1">Missing ({parsed.missing_skills.length})</div>
                      <Chips items={parsed.missing_skills.slice(0, 8)} />
                    </div>
                  )}
                </div>

                {parsed.role_summary && (
                  <div>
                    <div className="text-xs text-gray-500 font-semibold mb-1">Role summary</div>
                    <p className="text-sm text-gray-400 leading-relaxed">{parsed.role_summary}</p>
                  </div>
                )}

                {parsed.cover_letter_hook && (
                  <div className="bg-gray-800/60 rounded-lg p-3">
                    <div className="text-xs text-gray-500 font-semibold mb-1">Suggested cover letter hook</div>
                    <p className="text-sm text-gray-300 italic">&ldquo;{parsed.cover_letter_hook}&rdquo;</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ['Seniority', parsed.seniority_level],
                    ['Stage', parsed.company_stage],
                    ['Visa', parsed.visa_sponsorship === true ? 'Yes' : parsed.visa_sponsorship === false ? 'No' : '?'],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
                      <div className="text-gray-600">{l}</div>
                      <div className="text-gray-300 font-medium capitalize">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Generate options ── */}
          {step === 3 && parsed && (
            <div className="space-y-5 max-w-xl">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Generate Documents</h3>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Generate CV', val: genCv, set: setGenCv },
                  { label: 'Generate Cover Letter', val: genCl, set: setGenCl },
                ].map(({ label, val, set }) => (
                  <button key={label} onClick={() => set(!val)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors
                      ${val ? 'bg-indigo-900/40 border-indigo-600 text-indigo-200' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                      ${val ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>
                      {val && <span className="text-white text-xs">✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {(genCv || genCl) && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">Sections to include</label>
                    <div className="flex flex-wrap gap-2">
                      {SECTIONS_OPTIONS.map(s => (
                        <button key={s} onClick={() => toggleSection(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize
                            ${sections.includes(s) ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">AI hints (pre-filled from analysis)</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {hints.map(h => (
                        <span key={h} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-800/40">
                          {h}
                          <button onClick={() => removeHint(h)} className="text-indigo-600 hover:text-red-400">&times;</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={hintInput} onChange={e => setHintInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addHint()}
                        placeholder="Add a hint and press Enter"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                      />
                      <button onClick={addHint} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs">Add</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">CV Template</label>
                      <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        {['classic','modern','minimal','sidebar','executive','compact'].map(t => (
                          <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Cover Letter Tone</label>
                      <select value={tone} onChange={e => setTone(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                        {['professional','conversational','technical','enthusiastic'].map(t => (
                          <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Accent Colour</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                        className="w-10 h-9 rounded border border-gray-700 bg-gray-800 cursor-pointer p-0.5"
                      />
                      <span className="text-sm text-gray-400 font-mono">{accentColor}</span>
                    </div>
                  </div>
                </>
              )}

              {importErr && (
                <div className="px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/50 text-red-400 text-sm">{importErr}</div>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && result && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-green-900/40 border-2 border-green-600 flex items-center justify-center text-3xl">
                {generating ? '⟳' : '✓'}
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">
                  {generating ? 'Generating documents…' : 'All done!'}
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  {generating
                    ? 'CV and cover letter are being generated in the background'
                    : `Application created${(genCv || genCl) ? ' with documents' : ''}`}
                </p>
              </div>
              {!generating && (
                <button
                  onClick={() => { onClose(); router.push(`/applications/${result.application.id}`); }}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors">
                  View Application →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 4 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
            <button
              onClick={() => { if (step === 1) onClose(); else setStep(s => (s - 1) as 1 | 2 | 3 | 4); }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            <div className="flex items-center gap-2">
              {step === 1 && (
                <button onClick={handleParse} disabled={parsing || rawText.trim().length < 50}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed
                    text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2">
                  {parsing ? <><span className="animate-spin">⟳</span> Parsing…</> : 'Parse with AI →'}
                </button>
              )}

              {step === 2 && (
                <>
                  <button onClick={handleSaveOnly} disabled={importing}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    Save Only
                  </button>
                  <button onClick={() => setStep(3)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors">
                    Save & Generate →
                  </button>
                </>
              )}

              {step === 3 && (
                <>
                  <button onClick={handleSaveOnly} disabled={importing}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    Skip, save only
                  </button>
                  <button onClick={handleImportAndGenerate} disabled={importing}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                      text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2">
                    {importing ? <><span className="animate-spin">⟳</span> Creating…</> : 'Create & Generate →'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
