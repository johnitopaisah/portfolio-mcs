'use client';
// "Application context" — the CV you actually sent and the job description.
// The AI uses both for interview questions, the prep checklist and follow-up
// drafts. Matters most for applications detected from email, which arrive
// with no CV and no job ad attached.
import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/api';
import { showError } from '@/lib/dialog';

interface Context { cv_source: string | null; cv_label: string | null; cv_text: string | null; job_description: string | null }
interface CvOption { source: string; label: string; created_at?: string }
interface CvOptions { documents: CvOption[]; base_versions: CvOption[] }

const MAX_PDF_MB = 5;
const card  = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' };
const field = { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' };

export default function ApplicationContextCard({ appId, onChanged }: { appId: number; onChanged?: () => void }) {
  const [ctx, setCtx]           = useState<Context | null>(null);
  const [options, setOptions]   = useState<CvOptions>({ documents: [], base_versions: [] });
  const [cvSource, setCvSource] = useState('');
  const [jd, setJd]             = useState('');
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function apply(c: Context) {
    setCtx(c);
    setCvSource(c.cv_source || '');
    setJd(c.job_description || '');
  }

  useEffect(() => {
    let live = true;
    Promise.allSettled([adminApi.getApplicationContext(appId), adminApi.getCvOptions()]).then(([c, o]) => {
      if (!live) return;
      if (c.status === 'fulfilled') apply(c.value as Context);
      if (o.status === 'fulfilled') setOptions(o.value as CvOptions);
    });
    return () => { live = false; };
  }, [appId]);

  const dirty = !!ctx && (cvSource !== (ctx.cv_source || '') || jd !== (ctx.job_description || ''));

  async function save() {
    setSaving(true); setSaved(false);
    try {
      apply(await adminApi.setApplicationContext(appId, { cv_source: cvSource || null, job_description: jd.trim() || null }) as Context);
      setSaved(true); onChanged?.();
    } catch (err) { showError(err, "Couldn't save the application context."); }
    finally { setSaving(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PDF_MB * 1024 * 1024) { showError(`That PDF is larger than ${MAX_PDF_MB} MB.`); return; }
    setUploading(true); setSaved(false);
    try {
      apply(await adminApi.uploadApplicationCv(appId, file) as Context);
      adminApi.getCvOptions().then(o => setOptions(o as CvOptions)).catch(() => {});
      setSaved(true); onChanged?.();
    } catch (err) { showError(err, "Couldn't read that PDF."); }
    finally { setUploading(false); }
  }

  // An uploaded CV is shown as its own option so the select reflects it.
  const uploadedOption = cvSource.startsWith('upload:') && ctx?.cv_label ? [{ source: cvSource, label: ctx.cv_label }] : [];

  return (
    <div className="rounded-2xl p-5" style={card}>
      <p className="text-sm font-semibold" style={{ color: '#DDD6FE' }}>Application context</p>
      <p className="text-xs mt-1 mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
        The CV you sent and the job description. The AI uses them for questions, the checklist and follow-up emails.
      </p>
      {!ctx ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</p> : (
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="ctx-cv" className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>CV used</label>
            <select id="ctx-cv" value={cvSource} onChange={e => { setCvSource(e.target.value); setSaved(false); }}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg outline-none" style={field}>
              <option value="">None selected</option>
              {uploadedOption.map(o => <option key={o.source} value={o.source}>{o.label}</option>)}
              {options.documents.length > 0 && (
                <optgroup label="CV Library (tailored)">
                  {options.documents.map(o => <option key={o.source} value={o.source}>{o.label}</option>)}
                </optgroup>
              )}
              {options.base_versions.length > 0 && (
                <optgroup label="Base CVs">
                  {options.base_versions.map(o => <option key={o.source} value={o.source}>{o.label}</option>)}
                </optgroup>
              )}
            </select>
            <div className="flex items-center gap-2 mt-2">
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} aria-label="Upload CV PDF" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="px-3 py-1.5 text-xs rounded-lg font-medium disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#E9D5FF', border: '1px solid rgba(255,255,255,0.15)' }}>
                {uploading ? 'Reading PDF…' : 'Upload PDF'}
              </button>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Max {MAX_PDF_MB} MB · text is extracted</span>
            </div>
            {ctx.cv_text && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer" style={{ color: 'rgba(255,255,255,0.5)' }}>Preview what the AI reads</summary>
                <pre className="text-xs mt-1 p-2 rounded-lg whitespace-pre-wrap max-h-40 overflow-auto"
                  style={{ background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.7)' }}>{ctx.cv_text.slice(0, 1500)}{ctx.cv_text.length > 1500 ? '…' : ''}</pre>
              </details>
            )}
          </div>
          <div>
            <label htmlFor="ctx-jd" className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Job description</label>
            <textarea id="ctx-jd" value={jd} onChange={e => { setJd(e.target.value); setSaved(false); }} rows={5} maxLength={20000}
              placeholder="Paste the job ad. If empty, the linked job's description is used."
              className="w-full px-2.5 py-2 text-xs rounded-lg outline-none resize-y" style={field} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={!dirty || saving}
              className="px-3 py-1.5 text-xs rounded-lg font-medium disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.25)', color: '#E9D5FF', border: '1px solid rgba(168,85,247,0.4)' }}>
              {saving ? 'Saving…' : 'Save context'}
            </button>
            {saved && !dirty && <span className="text-xs" role="status" style={{ color: '#4ade80' }}>Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
