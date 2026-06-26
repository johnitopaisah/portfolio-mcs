'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import DocumentEditor from '@/components/DocumentEditor';

// ── Types ────────────────────────────────────────────────────
interface AppEvent {
  id: number;
  application_id: number;
  event_type: string;
  description: string | null;
  event_date: string;
}

interface AppDocument {
  id: number;
  document_type: string;
  version: number;
  ai_model: string | null;
  generated_by_ai: boolean;
  template_id: string | null;
  color_scheme: string | null;
  accent_color: string | null;
  sections_included: string[] | null;
  generation_hints: string | null;
  generation_config: Record<string, unknown> | null;
  created_at: string;
  is_manually_edited?: boolean;
  edited_at?: string | null;
}

interface AppEmailResponse {
  id: number;
  sender_email: string;
  sender_name: string;
  subject: string;
  ai_classification: string;
  confidence_score: number | null;
  received_at: string;
}

interface AppContact {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  role: string;
  notes: string | null;
  created_at: string;
}

interface AppReminder {
  id: number;
  title: string;
  remind_at: string;
  reminder_type: string;
  is_done: boolean;
  created_at: string;
}

interface Application {
  id: number;
  job_id: string | null;
  company_name: string;
  job_title: string;
  job_url: string | null;
  source_url: string | null;
  source_platform: string | null;
  entry_method: string | null;
  match_score: string | number | null;
  status: string;
  applied_at: string | null;
  notes: string | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  strongest_angle: string | null;
  cover_letter_hook: string | null;
  suggested_hints: string[] | null;
  follow_up_at: string | null;
  interview_at: string | null;
  submitted_doc_id: number | null;
  referral_from: string | null;
  interview_prep: {
    tech_to_review?: string[];
    key_requirements?: string[];
    checklist?: { text: string; done: boolean }[];
    star_prompts?: string[];
  } | null;
  created_at: string;
  updated_at: string;
  events: AppEvent[];
  documents: AppDocument[];
  contacts: AppContact[];
  reminders: AppReminder[];
}

interface Job {
  id: string;
  title: string;
  company_name: string;
  description: string | null;
  requirements: string | null;
  ai_reasoning: string | null;
  relevance_score: number | null;
  apply_url: string | null;
}

interface CvTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  atsScore: number;
  supportsColor: boolean;
  layout: string;
  bestFor: string[];
}

interface SectionPreset {
  label: string;
  sections: string[];
}

interface GenerationConfig {
  force: boolean;
  language: string;
  templateId: string;
  colorScheme: string;
  accentColor: string;
  sections: string[];
  userHints: string;
  hintChips: string[];
  intensity: string;
  fontFamily: string;
  fontSize: string;
  lineDensity: string;
}

interface CoverLetterConfig {
  language: string;
  tone: string;
  length: string;
  format: string;
  userHints: string;
  accentColor: string;
  colorScheme: string;
  linkedCvDocumentId: number | null;
}

// ── Constants ─────────────────────────────────────────────────
const PAST_APPLIED = new Set([
  'APPLIED', 'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER',
  'REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED',
]);

const STATUS_PIPELINE_STAGES = [
  { value: 'DRAFT',               label: 'Draft',              group: 'prep',      color: 'gray' },
  { value: 'CV_GENERATED',        label: 'CV Ready',           group: 'prep',      color: 'blue' },
  { value: 'READY_TO_APPLY',      label: 'Ready',              group: 'prep',      color: 'indigo' },
  { value: 'APPLIED',             label: 'Applied',            group: 'active',    color: 'purple' },
  { value: 'EMAIL_RECEIVED',      label: 'Email',              group: 'active',    color: 'yellow' },
  { value: 'HR_CONTACTED',        label: 'HR',                 group: 'active',    color: 'yellow' },
  { value: 'INTERVIEW_INVITE',    label: 'Invited',            group: 'interview', color: 'orange' },
  { value: 'INTERVIEW_SCHEDULED', label: 'Interview',          group: 'interview', color: 'orange' },
  { value: 'TECHNICAL_TEST',      label: 'Technical',          group: 'interview', color: 'orange' },
  { value: 'FINAL_INTERVIEW',     label: 'Final',              group: 'interview', color: 'orange' },
  { value: 'OFFER',               label: 'Offer',              group: 'outcome',   color: 'green' },
  { value: 'NEGOTIATING',         label: 'Negotiating',        group: 'outcome',   color: 'green' },
  { value: 'ACCEPTED',            label: 'Accepted',           group: 'outcome',   color: 'emerald' },
  { value: 'DECLINED_OFFER',      label: 'Declined',           group: 'outcome',   color: 'gray' },
  { value: 'REJECTED',            label: 'Rejected',           group: 'closed',    color: 'red' },
  { value: 'NO_RESPONSE',         label: 'No Response',        group: 'closed',    color: 'red' },
  { value: 'WITHDRAWN',           label: 'Withdrawn',          group: 'closed',    color: 'gray' },
  { value: 'GHOSTED',             label: 'Ghosted',            group: 'closed',    color: 'gray' },
  { value: 'ARCHIVED',            label: 'Archived',           group: 'closed',    color: 'gray' },
];

const FORWARD_STATUSES = STATUS_PIPELINE_STAGES.map(s => s.value);
const CLOSED_STATUSES  = ['REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'DECLINED_OFFER'];

const ALL_SECTIONS = [
  { key: 'summary',        label: 'Professional Summary', icon: '◈' },
  { key: 'skills',         label: 'Technical Skills',     icon: '⚙' },
  { key: 'experience',     label: 'Work Experience',      icon: '◎' },
  { key: 'education',      label: 'Education',            icon: '◑' },
  { key: 'certifications', label: 'Certifications',       icon: '★' },
  { key: 'projects',       label: 'Projects',             icon: '◆' },
  { key: 'references',     label: 'References',           icon: '◉' },
];

const HINT_CHIPS = [
  'Emphasize leadership',
  'Focus on technical depth',
  'Highlight remote work',
  'Startup culture tone',
  'Senior/executive language',
  'Keep to 1 page',
  'Minimize employment gaps',
  'Emphasize international experience',
  'Focus on cloud infrastructure',
  'Highlight open source contributions',
];

const ACCENT_PRESETS = [
  { label: 'Indigo',  value: '#7C3AED' },
  { label: 'Blue',    value: '#2563EB' },
  { label: 'Teal',    value: '#0D9488' },
  { label: 'Green',   value: '#16A34A' },
  { label: 'Slate',   value: 'rgba(255,255,255,0.32)' },
  { label: 'Purple',  value: '#7C3AED' },
  { label: 'Rose',    value: '#E11D48' },
  { label: 'Amber',   value: '#D97706' },
];

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s    = Math.floor(diff / 1000);
  const m    = Math.floor(s / 60);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  const rtf  = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (d > 0) return rtf.format(-d, 'day');
  if (h > 0) return rtf.format(-h, 'hour');
  if (m > 0) return rtf.format(-m, 'minute');
  return rtf.format(-s, 'second');
}

function scoreBadge(score: string | number | null) {
  const s = score !== null ? parseFloat(String(score)) : 0;
  if (s >= 80) return 'bg-green-900/40 text-green-400 border border-green-700/40';
  if (s >= 60) return 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40';
  return 'bg-gray-800 text-gray-500 border border-gray-700/50';
}

function statusBadge(status: string) {
  switch (status) {
    case 'DRAFT':               return 'bg-gray-800 text-gray-400';
    case 'CV_GENERATED':        return 'bg-blue-900/50 text-blue-300';
    case 'READY_TO_APPLY':      return 'bg-indigo-900/50 text-indigo-300';
    case 'APPLIED':             return 'bg-purple-900/50 text-purple-300';
    case 'EMAIL_RECEIVED':
    case 'HR_CONTACTED':        return 'bg-yellow-900/50 text-yellow-300';
    case 'INTERVIEW_INVITE':
    case 'INTERVIEW_SCHEDULED':
    case 'FINAL_INTERVIEW':
    case 'TECHNICAL_TEST':      return 'bg-orange-900/50 text-orange-300';
    case 'OFFER':               return 'bg-green-900/50 text-green-300';
    case 'REJECTED':
    case 'NO_RESPONSE':         return 'bg-red-900/40 text-red-400';
    case 'ARCHIVED':            return 'bg-gray-800 text-gray-500';
    default:                    return 'bg-gray-800 text-gray-400';
  }
}

function eventDot(type: string) {
  switch (type) {
    case 'APPLICATION_CREATED': return 'bg-gray-500';
    case 'STATUS_CHANGED':      return 'bg-blue-500';
    case 'NOTE_ADDED':          return 'bg-yellow-400';
    case 'CV_GENERATED':        return 'bg-green-500';
    case 'EMAIL_RECEIVED':
    case 'INTERVIEW_INVITE':    return 'bg-orange-500';
    case 'REJECTION_RECEIVED':  return 'bg-red-500';
    case 'OFFER_RECEIVED':      return 'bg-emerald-400';
    default:                    return 'bg-gray-500';
  }
}

function atsColor(score: number) {
  if (score >= 90) return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  if (score >= 80) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
  if (score >= 70) return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
  return 'bg-red-500/20 text-red-400 border border-red-500/30';
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Template mini-thumbnails ──────────────────────────────────
function TemplateThumbnail({ layout, accent, colorScheme }: { layout: string; accent: string; colorScheme: string }) {
  const c = colorScheme === 'bw' ? '#64748b' : accent;
  const cl = `${c}30`;

  if (layout === 'sidebar') return (
    <div className="w-full h-full flex rounded overflow-hidden bg-white/5">
      <div className="w-8 shrink-0 p-1 flex flex-col gap-1" style={{ background: c }}>
        <div className="h-1.5 w-full rounded-sm bg-white/40" />
        <div className="h-1 w-3/4 rounded-sm bg-white/25 mt-0.5" />
        <div className="mt-1 h-px w-full bg-white/20" />
        <div className="h-0.5 w-full rounded-sm bg-white/20 mt-0.5" />
        <div className="h-0.5 w-4/5 rounded-sm bg-white/20" />
        <div className="h-0.5 w-2/3 rounded-sm bg-white/20" />
      </div>
      <div className="flex-1 p-1.5 flex flex-col gap-0.5">
        <div className="h-2 w-3/4 rounded-sm" style={{ background: c, opacity: 0.6 }} />
        <div className="h-0.5 w-1/2 rounded-sm bg-white/20 mt-0.5" />
        <div className="h-px bg-white/10 my-1" />
        {[1, 0.8, 0.9, 0.7].map((w, i) => (
          <div key={i} className="h-0.5 rounded-sm bg-white/20" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );

  if (layout === 'modern-header') return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden bg-white/5">
      <div className="h-7 shrink-0 flex items-center px-2 gap-1.5" style={{ background: c }}>
        <div className="h-2 w-12 rounded-sm bg-white/80" />
        <div className="flex-1" />
        <div className="h-1.5 w-5 rounded-sm bg-white/40" />
      </div>
      <div className="flex-1 p-1.5 flex flex-col gap-0.5">
        <div className="flex gap-2 mb-1">
          {[1, 1].map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: c, opacity: 0.5 }} />
          ))}
        </div>
        <div className="h-px bg-white/10 mb-1" />
        {[0.9, 0.7, 0.85, 0.6].map((w, i) => (
          <div key={i} className="h-0.5 rounded-sm bg-white/20" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );

  if (layout === 'side-label') return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden bg-white/5 p-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-2 w-10 rounded-sm" style={{ background: c, opacity: 0.8 }} />
        <div className="h-px flex-1 bg-white/15" />
        <div className="h-1 w-6 rounded-sm bg-white/25" />
      </div>
      <div className="h-px bg-white/10 mb-1" />
      {[0, 1, 2].map(i => (
        <div key={i} className="flex gap-1.5 mb-1">
          <div className="h-1.5 w-8 rounded-sm shrink-0" style={{ background: c, opacity: 0.5 }} />
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="h-0.5 rounded-sm bg-white/25 w-full" />
            <div className="h-0.5 rounded-sm bg-white/15 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );

  if (layout === 'creative') return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden bg-white/5 p-1.5">
      <div className="flex items-end gap-1.5 mb-1.5">
        <div className="h-3 w-6 rounded-sm" style={{ background: c }} />
        <div className="flex-1 h-px" style={{ background: c, opacity: 0.3 }} />
      </div>
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-start gap-1.5 mb-1">
          <div className="w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center" style={{ borderColor: c }}>
            <div className="w-1 h-1 rounded-full" style={{ background: c }} />
          </div>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="h-1 rounded-sm" style={{ background: c, opacity: 0.6, width: '60%' }} />
            <div className="h-0.5 rounded-sm bg-white/20 w-full" />
          </div>
        </div>
      ))}
    </div>
  );

  if (layout === 'europass') return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden bg-white/5 p-1.5">
      <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-white/10">
        <div className="w-4 h-4 rounded-sm" style={{ background: c, opacity: 0.7 }} />
        <div className="flex-1">
          <div className="h-1.5 w-12 rounded-sm" style={{ background: c, opacity: 0.8 }} />
          <div className="h-0.5 w-8 rounded-sm bg-white/25 mt-0.5" />
        </div>
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-1 mb-0.5">
          <div className="h-0.5 w-6 rounded-sm shrink-0" style={{ background: c, opacity: 0.5 }} />
          <div className="h-0.5 w-full rounded-sm bg-white/20" />
        </div>
      ))}
    </div>
  );

  // default: 'single' (classic, minimal, ats-pure, executive, technical, harvard, wallstreet)
  return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden bg-white/5 p-1.5">
      <div className="text-center mb-1.5">
        <div className="h-2 w-14 mx-auto rounded-sm" style={{ background: c, opacity: 0.9 }} />
        <div className="h-0.5 w-10 mx-auto rounded-sm bg-white/30 mt-0.5" />
        <div className="h-px w-full bg-white/10 mt-1" />
      </div>
      {[0.95, 0.7, 0.85, 0.6, 0.75, 0.5].map((w, i) => (
        <div key={i} className="h-0.5 rounded-sm mb-0.5 bg-white/20" style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

// ── Segmented control ─────────────────────────────────────────
function SegmentControl({ options, value, onChange }: {
  options: { value: string; label: string; desc?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2.5 px-3 text-xs font-semibold transition-all ${
            i > 0 ? 'border-l border-gray-700' : ''
          } ${
            value === opt.value
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          <div>{opt.label}</div>
          {opt.desc && <div className={`text-[10px] font-normal mt-0.5 ${value === opt.value ? 'text-indigo-200' : 'text-gray-600'}`}>{opt.desc}</div>}
        </button>
      ))}
    </div>
  );
}

// ── Generation Drawer ─────────────────────────────────────────
const FONT_OPTIONS = [
  { value: 'inter',    label: 'Inter',    desc: 'Clean & modern sans-serif' },
  { value: 'calibri',  label: 'Calibri',  desc: 'Office default — familiar' },
  { value: 'georgia',  label: 'Georgia',  desc: 'Traditional serif' },
  { value: 'garamond', label: 'Garamond', desc: 'Elegant & compact serif' },
  { value: 'roboto',   label: 'Roboto',   desc: 'Tech-friendly sans-serif' },
];

const FONT_SIZES_ASC = ['8.5pt', '9pt', '9.5pt', '10pt', '10.5pt', '11pt', '11.5pt', '12pt'];

function measureIframeHeight(blobUrl: string): Promise<number> {
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;height:2000px;border:0;visibility:hidden;';
    iframe.onload = () => {
      const h = iframe.contentDocument?.body?.scrollHeight ?? 9999;
      try { document.body.removeChild(iframe); } catch {}
      resolve(h);
    };
    iframe.onerror = () => { try { document.body.removeChild(iframe); } catch {} resolve(9999); };
    document.body.appendChild(iframe);
    iframe.src = blobUrl;
  });
}

function GenerationDrawer({ job, appId, latestCvDocId, latestCvDoc, onGenerate, generating, onClose }: {
  job: Job | null;
  appId: string;
  latestCvDocId: number | null;
  latestCvDoc: AppDocument | null;
  onGenerate: (config: GenerationConfig) => void;
  generating: boolean;
  onClose: () => void;
}) {
  const [editMode,        setEditMode]        = useState(false);
  const [editInitialHtml, setEditInitialHtml] = useState<string | null>(null);
  const [isManuallyEdited, setIsManuallyEdited] = useState(!!latestCvDoc?.is_manually_edited);
  const [showCompare,     setShowCompare]     = useState(false);
  const [compareUrl,      setCompareUrl]      = useState<string | null>(null);
  const [editPageCount,   setEditPageCount]   = useState<number | null>(null);
  const [tab,           setTab]          = useState<'template' | 'sections' | 'ai'>('template');
  const [templates,     setTemplates]    = useState<CvTemplate[]>([]);
  const [presets,       setPresets]      = useState<Record<string, SectionPreset>>({});
  const [suggestedPreset, setSuggested]  = useState<string | null>(null);
  const [sectionStatus, setSectionStatus] = useState<Record<string, boolean>>({});

  const [templateId,   setTemplateId]  = useState('classic');
  const [colorScheme,  setColorScheme] = useState('colored');
  const [accentColor,  setAccentColor] = useState('#2563EB');
  const [sections,     setSections]    = useState(['summary', 'skills', 'experience', 'education', 'certifications']);
  const [userHints,    setUserHints]   = useState('');
  const [chips,        setChips]       = useState<string[]>([]);
  const [intensity,    setIntensity]   = useState('balanced');
  const [language,     setLanguage]    = useState('en');
  const [fontFamily,   setFontFamily]  = useState('inter');
  const [fontSize,     setFontSize]    = useState('10.5pt');
  const [lineDensity,  setLineDensity] = useState('normal');

  const [previewUrl,      setPreviewUrl]      = useState<string | null>(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [pageCount,       setPageCount]       = useState<number | null>(null);
  const [fittingPage,     setFittingPage]     = useState(false);
  const [previewScale,    setPreviewScale]    = useState(0.65);
  const [refreshingData,  setRefreshingData]  = useState(false);
  const [refreshMsg,      setRefreshMsg]      = useState<string | null>(null);

  const iframeRef        = useRef<HTMLIFrameElement>(null);
  const previewPanelRef  = useRef<HTMLDivElement>(null);
  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBlobUrl    = useRef<string | null>(null);

  useEffect(() => {
    adminApi.getCvTemplates(job?.description || '')
      .then((data: any) => {
        setTemplates(data.cv_templates || []);
        setPresets(data.section_presets || {});
        if (data.suggested_preset) {
          setSuggested(data.suggested_preset);
          const p = data.section_presets[data.suggested_preset];
          if (p) setSections(p.sections);
        }
      })
      .catch(() => {});
    adminApi.getProfileSectionsStatus()
      .then(setSectionStatus)
      .catch(() => {});
  }, [job]);

  // Track panel width for A4 scale
  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? 700;
      setPreviewScale(Math.max(0.3, (w - 48) / 794));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Debounced live preview on cosmetic setting changes — skipped while in
  // Edit mode or once manually edited, since those cosmetic pickers would
  // otherwise silently swap the preview away from the saved manual edit.
  useEffect(() => {
    if (!latestCvDocId || editMode || isManuallyEdited) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const url = await adminApi.reformatDocument(appId, latestCvDocId, {
          templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity, sections,
        });
        if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current);
        latestBlobUrl.current = url;
        setPreviewUrl(url);
      } catch {}
      finally { setPreviewLoading(false); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity, sections, latestCvDocId, appId, editMode, isManuallyEdited]);

  useEffect(() => () => { if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current); }, []);

  // Keep isManuallyEdited in sync with the latest document prop (e.g. a
  // fresh "Generate" creates a brand-new, not-yet-edited version).
  useEffect(() => {
    setIsManuallyEdited(!!latestCvDoc?.is_manually_edited);
    setEditMode(false);
  }, [latestCvDoc?.id, latestCvDoc?.is_manually_edited]);

  function handleIframeLoad() {
    try {
      const h = iframeRef.current?.contentDocument?.body?.scrollHeight ?? 0;
      if (h > 0) setPageCount(h / 1123);
    } catch {}
  }

  async function fitToOnePage() {
    if (!latestCvDocId || fittingPage) return;
    setFittingPage(true);
    const startIdx = FONT_SIZES_ASC.indexOf(fontSize);
    for (let i = Math.max(startIdx, 0); i >= 0; i--) {
      const trySize = FONT_SIZES_ASC[i];
      try {
        const url = await adminApi.reformatDocument(appId, latestCvDocId, {
          templateId, colorScheme, accentColor, fontFamily, fontSize: trySize, lineDensity, sections,
        });
        const h = await measureIframeHeight(url);
        if (h <= 1130) {
          setFontSize(trySize);
          if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current);
          latestBlobUrl.current = url;
          setPreviewUrl(url);
          setPageCount(h / 1123);
          break;
        }
        URL.revokeObjectURL(url);
      } catch {}
    }
    setFittingPage(false);
  }

  async function handleRefreshData() {
    setRefreshingData(true);
    setRefreshMsg(null);
    try {
      const result: any = await adminApi.refreshBaseCv();
      const c = result.section_counts;
      setRefreshMsg(`✓ Profile snapshot refreshed: ${c.experiences} exp · ${c.education} edu · ${c.projects} projects · ${c.references} refs`);
      const status = await adminApi.getProfileSectionsStatus();
      setSectionStatus(status);
    } catch (e: any) {
      setRefreshMsg(`✗ ${e.message}`);
    } finally {
      setRefreshingData(false);
    }
  }

  const toggleSection = (key: string) =>
    setSections(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  const toggleChip = (chip: string) =>
    setChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]);

  async function enterEditMode() {
    if (!latestCvDocId) return;
    try {
      const html = await adminApi.getDocumentSourceHtml(appId, latestCvDocId);
      setEditInitialHtml(html);
      setEditMode(true);
      setShowCompare(false);
    } catch { /* silent — preview just won't open */ }
  }

  function handleEditCancel() {
    setEditMode(false);
    setEditInitialHtml(null);
  }

  function handleEditSaved() {
    setIsManuallyEdited(true);
    setEditMode(false);
    setEditInitialHtml(null);
    // Re-fetch the (now edited) document as the read-only preview
    if (latestCvDocId) {
      adminApi.getDocumentSourceHtml(appId, latestCvDocId).then(html => {
        const blob = new Blob([html], { type: 'text/html' });
        if (latestBlobUrl.current) URL.revokeObjectURL(latestBlobUrl.current);
        const url = URL.createObjectURL(blob);
        latestBlobUrl.current = url;
        setPreviewUrl(url);
      }).catch(() => {});
    }
  }

  async function toggleCompare() {
    if (showCompare) { setShowCompare(false); return; }
    if (!latestCvDocId) return;
    try {
      const url = await adminApi.getAiOriginalDocument(appId, latestCvDocId);
      setCompareUrl(url);
      setShowCompare(true);
    } catch { /* silent */ }
  }

  const selectedTmpl = templates.find(t => t.id === templateId);
  const scaledH = Math.round(1123 * previewScale);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Thin backdrop strip */}
      <div className="w-10 shrink-0 bg-black/60 cursor-pointer" onClick={onClose} />

      {/* Full split panel */}
      <div className="flex-1 flex bg-gray-950 border-l border-gray-800 shadow-2xl overflow-hidden">

        {/* ── Left: Config ── */}
        <div className="w-[460px] shrink-0 flex flex-col border-r border-gray-800 h-full">

          {/* Header */}
          <div className="px-6 pt-5 pb-0 border-b border-gray-800 shrink-0">
            <div className="flex items-start justify-between gap-4 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">Generate CV</h2>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {selectedTmpl?.name || 'Classic'} · {colorScheme === 'bw' ? 'B&W' : 'Coloured'} · {fontFamily} {fontSize} · {sections.length} sections
                </p>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-1">
              {([
                { key: 'template', label: '① Template & Font' },
                { key: 'sections', label: '② Sections' },
                { key: 'ai',       label: '③ AI Guidance' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-2.5 rounded-t-lg text-xs font-semibold transition-all -mb-px border-b-2 ${
                    tab === t.key
                      ? 'text-indigo-300 border-indigo-500 bg-indigo-950/30'
                      : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── Tab 1: Template & Font ── */}
            {tab === 'template' && (
              <div className="space-y-6">
                <div className="w-40">
                  <label className="label-xs mb-2 block">Language</label>
                  <SegmentControl
                    options={[{ value: 'en', label: 'EN' }, { value: 'fr', label: 'FR' }]}
                    value={language} onChange={setLanguage}
                  />
                </div>

                <div>
                  <label className="label-xs mb-2.5 block">Template — {templates.length} available</label>
                  <div className="grid grid-cols-3 gap-2">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => setTemplateId(t.id)}
                        className={`relative rounded-xl border-2 overflow-hidden text-left transition-all group ${
                          templateId === t.id ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-600'
                        }`}>
                        <div className="h-[64px] bg-gray-900 p-1.5">
                          <TemplateThumbnail layout={t.layout || 'single'} accent={accentColor} colorScheme={colorScheme} />
                        </div>
                        <div className={`px-2 py-1.5 ${templateId === t.id ? 'bg-indigo-950/60' : 'bg-gray-800/50 group-hover:bg-gray-800'}`}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-xs font-bold text-white truncate">{t.name}</span>
                            <span className={`text-[9px] px-1 rounded font-bold shrink-0 ${atsColor(t.atsScore)}`}>{t.atsScore}</span>
                          </div>
                          <p className="text-[9px] text-gray-500 line-clamp-1">{t.description}</p>
                        </div>
                        {templateId === t.id && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label-xs mb-2.5 block">Colour Scheme</label>
                  <SegmentControl
                    options={[
                      { value: 'colored', label: 'Coloured', desc: 'Accent applied' },
                      { value: 'bw',      label: 'B&W',      desc: 'Greyscale' },
                    ]}
                    value={colorScheme} onChange={setColorScheme}
                  />
                </div>

                {colorScheme === 'colored' && (
                  <div>
                    <label className="label-xs mb-2.5 block">Accent Colour</label>
                    <div className="flex flex-wrap gap-2">
                      {ACCENT_PRESETS.map(p => (
                        <button key={p.value} onClick={() => setAccentColor(p.value)} title={p.label}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${accentColor === p.value ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                          style={{ background: p.value }}
                        />
                      ))}
                      <label className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-gray-600 hover:border-gray-400 transition-colors relative" title="Custom">
                        <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                        <div className="w-full h-full" style={{ background: accentColor }} />
                      </label>
                    </div>
                  </div>
                )}

                {/* Font family */}
                <div>
                  <label className="label-xs mb-2.5 block">Font Family</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {FONT_OPTIONS.map(f => (
                      <button key={f.value} onClick={() => setFontFamily(f.value)}
                        className={`flex flex-col items-center py-2.5 px-1 rounded-xl border-2 transition-all ${
                          fontFamily === f.value
                            ? 'border-indigo-500 bg-indigo-950/50 text-indigo-300'
                            : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                        }`}>
                        <span className="text-sm font-bold leading-none mb-1">{f.label[0]}</span>
                        <span className="text-[9px] font-semibold leading-none">{f.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">{FONT_OPTIONS.find(f => f.value === fontFamily)?.desc ?? ''}</p>
                </div>

                {/* Font size */}
                <div>
                  <label className="label-xs mb-2.5 block">Font Size</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FONT_SIZES_ASC.map(s => (
                      <button key={s} onClick={() => setFontSize(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          fontSize === s
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line density */}
                <div>
                  <label className="label-xs mb-2.5 block">Line Density</label>
                  <SegmentControl
                    options={[
                      { value: 'compact', label: 'Compact', desc: 'Tight' },
                      { value: 'normal',  label: 'Normal',  desc: 'Balanced' },
                      { value: 'relaxed', label: 'Relaxed', desc: 'Airy' },
                    ]}
                    value={lineDensity} onChange={setLineDensity}
                  />
                </div>
              </div>
            )}

            {/* ── Tab 2: Sections ── */}
            {tab === 'sections' && (
              <div className="space-y-6">
                {/* Refresh profile data */}
                <div className="flex items-center gap-2">
                  <button onClick={handleRefreshData} disabled={refreshingData}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors font-medium disabled:opacity-50">
                    {refreshingData ? (
                      <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Refreshing…</>
                    ) : (
                      <>↻ Sync profile data</>
                    )}
                  </button>
                  {refreshMsg && (
                    <p className={`text-[10px] ${refreshMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{refreshMsg}</p>
                  )}
                </div>

                {Object.keys(presets).length > 0 && (
                  <div>
                    <label className="label-xs mb-2.5 block">
                      Presets
                      {suggestedPreset && <span className="ml-2 text-indigo-400 normal-case font-normal text-[11px]">★ auto-suggested</span>}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(presets).map(([key, preset]) => (
                        <button key={key} onClick={() => setSections((preset as SectionPreset).sections)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            suggestedPreset === key
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-indigo-500 hover:text-indigo-300'
                          }`}>
                          {suggestedPreset === key && '★ '}{(preset as SectionPreset).label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="label-xs">{sections.length} of {ALL_SECTIONS.length} selected</label>
                    <div className="flex gap-1.5">
                      <button onClick={() => setSections(ALL_SECTIONS.map(s => s.key))}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 px-2 py-0.5 rounded bg-indigo-900/20 hover:bg-indigo-900/40 transition-colors">All</button>
                      <button onClick={() => setSections(['summary', 'skills', 'experience'])}
                        className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition-colors">Min</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_SECTIONS.map(s => {
                      const active  = sections.includes(s.key);
                      const noData  = active && sectionStatus[s.key] === false;
                      return (
                        <button key={s.key} onClick={() => toggleSection(s.key)}
                          className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                            active
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                          }`}>
                          <span className={`text-base leading-none ${active ? 'text-indigo-200' : 'text-gray-600'}`}>{s.icon}</span>
                          {s.label}
                          {active && <span className="text-xs text-indigo-300 font-normal">#{sections.indexOf(s.key) + 1}</span>}
                          {noData && (
                            <span title="No profile data for this section"
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[9px] font-black text-white">!</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {ALL_SECTIONS.some(s => sections.includes(s.key) && sectionStatus[s.key] === false) && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-900/20 border border-amber-700/40">
                      <p className="text-xs text-amber-400 font-semibold">⚠ Some sections have no profile data</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">They may be empty in the generated CV. Add data in Settings first.</p>
                    </div>
                  )}
                </div>

                {sections.length > 0 && (
                  <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">CV order</p>
                    <p className="text-xs text-gray-300">{sections.map(k => ALL_SECTIONS.find(s => s.key === k)?.label || k).join(' → ')}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 3: AI Guidance ── */}
            {tab === 'ai' && (
              <div className="space-y-6">
                <div>
                  <label className="label-xs mb-2.5 block">AI Tailoring Intensity</label>
                  <SegmentControl
                    options={[
                      { value: 'conservative', label: 'Conservative', desc: 'Light rephrasing' },
                      { value: 'balanced',     label: 'Balanced',     desc: 'Keyword optimised' },
                      { value: 'aggressive',   label: 'Aggressive',   desc: 'Max alignment' },
                    ]}
                    value={intensity} onChange={setIntensity}
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Tailoring Instructions</label>
                  <textarea value={userHints} onChange={e => setUserHints(e.target.value)}
                    placeholder="e.g. Emphasize Kubernetes experience, senior leadership language, keep to 1 page…"
                    rows={5} maxLength={600}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder:text-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-[10px] text-gray-600">The AI will prioritise these instructions.</p>
                    <p className="text-[10px] text-gray-600">{userHints.length}/600</p>
                  </div>
                </div>
                <div>
                  <label className="label-xs mb-2 block">Quick Instructions</label>
                  <div className="flex flex-wrap gap-2">
                    {HINT_CHIPS.map(chip => (
                      <button key={chip} onClick={() => toggleChip(chip)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          chips.includes(chip) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                        }`}>{chip}</button>
                    ))}
                  </div>
                </div>
                {(userHints || chips.length > 0) && (
                  <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/40">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Active instructions</p>
                    {chips.map(c => <p key={c} className="text-xs text-indigo-200">· {c}</p>)}
                    {userHints && <p className="text-xs text-indigo-200 mt-1">· {userHints}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">{selectedTmpl?.name || 'Classic'} · {fontFamily} {fontSize} · {lineDensity}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {sections.length} sections · {intensity} intensity
                  {(chips.length || userHints) ? ` · ${chips.length + (userHints ? 1 : 0)} AI instruction${chips.length + (userHints ? 1 : 0) !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={onClose}
                  className="px-4 py-2.5 text-xs rounded-xl bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors font-semibold">Cancel</button>
                <button
                  onClick={() => onGenerate({ force: true, language, templateId, colorScheme, accentColor, sections, userHints, hintChips: chips, intensity, fontFamily, fontSize, lineDensity })}
                  disabled={generating || sections.length === 0}
                  className="px-5 py-2.5 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-40 transition-colors flex items-center gap-2">
                  {generating ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                  ) : 'Generate CV →'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Live A4 Preview ── */}
        <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0 bg-gray-950 flex-wrap">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Preview</span>
            {latestCvDocId && !editMode && !isManuallyEdited && <span className="text-[10px] text-gray-600">Auto-updates 0.6s after changes</span>}
            {isManuallyEdited && !editMode && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-yellow-950/40 text-yellow-400 border border-yellow-800/40">
                Manually edited — auto-regeneration disabled for this version
              </span>
            )}
            <div className="flex-1" />
            {editMode && editPageCount !== null && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                editPageCount > 1.05
                  ? 'bg-red-900/40 text-red-300 border-red-800/40'
                  : 'bg-green-900/40 text-green-300 border-green-800/40'
              }`}>
                {editPageCount > 1.05 ? `Page ~${editPageCount.toFixed(1)} — overflowing` : '✓ Fits 1 page'}
              </span>
            )}
            {!editMode && previewLoading && <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />}
            {!editMode && pageCount !== null && !previewLoading && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                pageCount > 1.05
                  ? 'bg-red-900/40 text-red-300 border-red-800/40'
                  : 'bg-green-900/40 text-green-300 border-green-800/40'
              }`}>
                {pageCount > 1.05 ? `~${pageCount.toFixed(1)} pages` : '✓ Fits 1 page'}
              </span>
            )}
            {!editMode && latestCvDocId && pageCount !== null && pageCount > 1.05 && !isManuallyEdited && (
              <button onClick={fitToOnePage} disabled={fittingPage || previewLoading}
                className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50 transition-colors flex items-center gap-1.5">
                {fittingPage ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Fitting…</> : 'Fit to 1 page'}
              </button>
            )}
            {!editMode && latestCvDocId && (
              <button onClick={toggleCompare}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors">
                {showCompare ? 'Hide AI original' : 'Compare to AI version'}
              </button>
            )}
            {!editMode && latestCvDocId && (
              <button onClick={enterEditMode}
                className="px-3 py-1.5 text-xs rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold transition-colors">
                ✎ Edit
              </button>
            )}
          </div>

          {editMode && editInitialHtml ? (
            <div className="flex-1 overflow-auto py-6 px-4">
              <DocumentEditor
                appId={appId}
                docId={latestCvDocId as number}
                initialHtml={editInitialHtml}
                onSaved={() => handleEditSaved()}
                onCancel={handleEditCancel}
                onPageMetrics={setEditPageCount}
              />
            </div>
          ) : showCompare && compareUrl ? (
            <div className="flex-1 overflow-auto py-8 px-4 flex gap-4 items-start justify-center">
              <div className="flex flex-col gap-2 items-center">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Your version</span>
                <iframe src={previewUrl ?? undefined} sandbox="allow-same-origin"
                  style={{ width: '397px', height: '561px', border: 0, transformOrigin: 'top left', transform: 'scale(0.5)', background: 'white', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }} />
              </div>
              <div className="flex flex-col gap-2 items-center">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Original AI draft</span>
                <iframe src={compareUrl} sandbox="allow-same-origin"
                  style={{ width: '397px', height: '561px', border: 0, transformOrigin: 'top left', transform: 'scale(0.5)', background: 'white', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }} />
              </div>
            </div>
          ) : (
          <div ref={previewPanelRef} className="flex-1 overflow-auto py-8 px-4 flex flex-col items-center">
            {!latestCvDocId ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center max-w-xs">
                <div className="w-16 h-16 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500 font-medium mb-1.5">No CV yet</p>
                <p className="text-xs text-gray-600 leading-relaxed">Generate your first CV. After that, the preview auto-updates as you adjust settings.</p>
              </div>
            ) : !previewUrl && previewLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Loading preview…</p>
              </div>
            ) : previewUrl ? (
              <div style={{ width: `${Math.round(794 * previewScale)}px`, height: `${scaledH}px`, position: 'relative', flexShrink: 0 }}>
                {pageCount && pageCount > 1.05 && (
                  <div style={{ position: 'absolute', top: `${Math.round(previewScale * 1123)}px`, left: 0, right: 0, height: '2px', background: 'rgba(239,68,68,0.75)', zIndex: 10 }}>
                    <span style={{ position: 'absolute', right: 0, top: '-16px', fontSize: '9px', background: 'rgba(239,68,68,0.85)', color: 'white', padding: '2px 6px', borderRadius: '3px 3px 0 0' }}>1-page limit</span>
                  </div>
                )}
                <iframe ref={iframeRef} src={previewUrl} onLoad={handleIframeLoad} sandbox="allow-same-origin"
                  style={{ width: '794px', height: '1123px', border: 0, transformOrigin: 'top left', transform: `scale(${previewScale})`, display: 'block', background: 'white', boxShadow: '0 4px 32px rgba(0,0,0,0.4)' }}
                  title="CV Preview"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center flex-1">
                <p className="text-xs text-gray-600">Preview will appear here</p>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cover Letter Drawer ───────────────────────────────────────
function CoverLetterDrawer({ documents, onGenerate, generating, onClose }: {
  documents: AppDocument[];
  onGenerate: (config: CoverLetterConfig) => void;
  generating: boolean;
  onClose: () => void;
}) {
  const [language,    setLanguage]    = useState('en');
  const [tone,        setTone]        = useState('professional');
  const [length,      setLength]      = useState('standard');
  const [format,      setFormat]      = useState('modern');
  const [userHints,   setUserHints]   = useState('');
  const [accentColor, setAccentColor] = useState('#2563EB');
  const [colorScheme, setColorScheme] = useState('colored');
  const [linkedCv,    setLinkedCv]    = useState<number | null>(null);

  const cvDocs = documents.filter(d => d.document_type === 'CV');

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="w-full max-w-[560px] bg-gray-950 border-l border-gray-800 flex flex-col h-full shadow-2xl">

        <div className="px-6 pt-5 pb-4 border-b border-gray-800 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Generate Cover Letter</h2>
              <p className="text-xs text-gray-500 mt-0.5">AI-written, company-specific cover letter</p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Language */}
          <div>
            <label className="label-xs mb-3 block">Language</label>
            <SegmentControl
              options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]}
              value={language}
              onChange={setLanguage}
            />
          </div>

          {/* Tone */}
          <div>
            <label className="label-xs mb-3 block">Tone</label>
            <SegmentControl
              options={[
                { value: 'formal',         label: 'Formal' },
                { value: 'professional',   label: 'Professional' },
                { value: 'conversational', label: 'Conversational' },
                { value: 'enthusiastic',   label: 'Enthusiastic' },
              ]}
              value={tone}
              onChange={setTone}
            />
          </div>

          {/* Length */}
          <div>
            <label className="label-xs mb-3 block">Length</label>
            <SegmentControl
              options={[
                { value: 'brief',    label: 'Brief',    desc: '~220 words' },
                { value: 'standard', label: 'Standard', desc: '~370 words' },
                { value: 'detailed', label: 'Detailed', desc: '~500 words' },
              ]}
              value={length}
              onChange={setLength}
            />
          </div>

          {/* Format */}
          <div>
            <label className="label-xs mb-3 block">Format / Template</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'modern',  label: 'Modern',  desc: 'Coloured header' },
                { value: 'classic', label: 'Classic', desc: 'Formal letter' },
                { value: 'email',   label: 'Email',   desc: 'Email body' },
              ]).map(f => (
                <button key={f.value} onClick={() => setFormat(f.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    format === f.value
                      ? 'border-green-500 bg-green-950/30'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                >
                  <div className={`text-sm font-bold mb-0.5 ${format === f.value ? 'text-green-300' : 'text-gray-200'}`}>{f.label}</div>
                  <div className="text-[10px] text-gray-500">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Link to CV */}
          {cvDocs.length > 0 && (
            <div>
              <label className="label-xs mb-2 block">Link to tailored CV <span className="text-gray-600 normal-case font-normal">(optional — provides richer context)</span></label>
              <select value={linkedCv ?? ''} onChange={e => setLinkedCv(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-green-500 transition-colors">
                <option value="">— Use base profile only —</option>
                {cvDocs.map(d => (
                  <option key={d.id} value={d.id}>
                    CV v{d.version} · {d.template_id || 'classic'} · {timeAgo(d.created_at)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Colour */}
          <div>
            <label className="label-xs mb-3 block">Colour Scheme</label>
            <SegmentControl
              options={[
                { value: 'colored', label: 'Coloured' },
                { value: 'bw',      label: 'B&W' },
              ]}
              value={colorScheme}
              onChange={setColorScheme}
            />
            {colorScheme === 'colored' && (
              <div className="flex flex-wrap gap-2 mt-3">
                {ACCENT_PRESETS.map(p => (
                  <button key={p.value} onClick={() => setAccentColor(p.value)} title={p.label}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${accentColor === p.value ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ background: p.value }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Hints */}
          <div>
            <label className="label-xs mb-2 block">Additional Instructions</label>
            <textarea value={userHints} onChange={e => setUserHints(e.target.value)}
              placeholder="e.g. Mention my passion for DevOps, emphasise openness to relocation, reference the specific product they mentioned…"
              rows={4} maxLength={500}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200
                placeholder:text-gray-600 resize-none focus:outline-none focus:border-green-500 transition-colors"
            />
            <p className="text-[10px] text-gray-600 mt-1 text-right">{userHints.length}/500</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 shrink-0 flex justify-between items-center gap-3">
          <p className="text-xs text-gray-600">{tone} · {length} · {format} template</p>
          <div className="flex gap-2.5">
            <button onClick={onClose}
              className="px-4 py-2.5 text-sm rounded-xl bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors font-medium">
              Cancel
            </button>
            <button
              onClick={() => onGenerate({ language, tone, length, format, userHints, accentColor, colorScheme, linkedCvDocumentId: linkedCv })}
              disabled={generating}
              className="px-6 py-2.5 text-sm rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating…
                </>
              ) : 'Generate Cover Letter →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────
function PreviewModal({ appId, doc, onClose }: { appId: string; doc: AppDocument; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let url: string;
    adminApi.previewDocument(appId, doc.id)
      .then((u: string) => { url = u; setBlobUrl(u); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [appId, doc.id]);

  const docLabel = doc.document_type === 'CV' ? `CV v${doc.version}` : `Cover Letter v${doc.version}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/98 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className={`text-xs font-bold px-2.5 py-1 rounded-md ${
            doc.document_type === 'CV'
              ? 'bg-blue-900/60 text-blue-300 border border-blue-800/50'
              : 'bg-green-900/60 text-green-300 border border-green-800/50'
          }`}>{docLabel}</div>
          {doc.template_id && <span className="text-xs text-gray-500">{doc.template_id}</span>}
          {doc.color_scheme && <span className="text-xs text-gray-600">{doc.color_scheme}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => adminApi.downloadCvDocument(appId, doc.id, `${docLabel.replace(' ', '-')}.pdf`)}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors font-medium flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-gray-800">
        {loading && (
          <div className="flex items-center justify-center h-full gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading preview…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
        )}
        {blobUrl && (
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={docLabel}
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}

// ── Edit Document Modal ────────────────────────────────────────
function EditDocumentModal({ appId, doc, onClose, onSaved }: {
  appId: string; doc: AppDocument; onClose: () => void; onSaved: () => void;
}) {
  const [html,    setHtml]    = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [pages,   setPages]   = useState<number | null>(null);

  useEffect(() => {
    adminApi.getDocumentSourceHtml(appId, doc.id)
      .then(setHtml)
      .catch((e: Error) => setError(e.message));
  }, [appId, doc.id]);

  const docLabel = doc.document_type === 'CV' ? `CV v${doc.version}` : `Cover Letter v${doc.version}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950/98 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-purple-900/50 text-purple-200 border border-purple-700">
            Editing {docLabel}
          </span>
          {pages !== null && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
              pages > 1.05 ? 'bg-red-900/40 text-red-300 border-red-800/40' : 'bg-green-900/40 text-green-300 border-green-800/40'
            }`}>
              {pages > 1.05 ? `Page ~${pages.toFixed(1)} — overflowing` : '✓ Fits 1 page'}
            </span>
          )}
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-900 py-6 px-4">
        {error && <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>}
        {!error && !html && (
          <div className="flex items-center justify-center h-full gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading document…
          </div>
        )}
        {html && (
          <DocumentEditor
            appId={appId}
            docId={doc.id}
            initialHtml={html}
            onCancel={onClose}
            onSaved={onSaved}
            onPageMetrics={setPages}
          />
        )}
      </div>
    </div>
  );
}

// ── Refine Modal ──────────────────────────────────────────────
function RefineModal({ appId, doc, onDone, onClose }: {
  appId: string;
  doc: AppDocument;
  onDone: () => void;
  onClose: () => void;
}) {
  const [hints,    setHints]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function handleRefine() {
    if (!hints.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await adminApi.refineDocument(appId, doc.id, hints.trim(), !!doc.is_manually_edited);
      onDone();
    } catch (e: any) {
      setError(e.message || 'Refinement failed');
      setLoading(false);
    }
  }

  const docLabel = doc.document_type === 'CV' ? `CV v${doc.version}` : `Cover Letter v${doc.version}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-sm font-bold text-white">Refine with AI</h3>
          <p className="text-xs text-gray-500 mt-0.5">Creates a new version of {docLabel} with your changes applied</p>
        </div>

        <div className="px-6 py-4 space-y-3">
          {doc.is_manually_edited && (
            <div className="p-3 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-xs text-yellow-400">
              ⚠ This version has manual edits. The refined version starts fresh from the original AI draft — your manual edits here will not carry forward.
            </div>
          )}
          <label className="label-xs mb-2 block">What should the AI change?</label>
          <textarea
            ref={textareaRef}
            value={hints}
            onChange={e => setHints(e.target.value)}
            placeholder="e.g. Make the summary more concise, add more impact metrics to the experience bullets, soften the tone, add the cloud migration project from my second job…"
            rows={5}
            maxLength={500}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200
              placeholder:text-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <p className="text-[10px] text-gray-600">Previous instructions will be preserved and this will be appended.</p>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/30 text-xs text-red-400">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-2.5">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm rounded-xl bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors font-medium disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleRefine} disabled={!hints.trim() || loading}
            className="px-5 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-40 transition-colors flex items-center gap-2">
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Refining…
              </>
            ) : 'Generate refined version →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────
function DocCard({ doc, appId, appName, onAction }: {
  doc: AppDocument;
  appId: string;
  appName: string;
  onAction: (action: 'preview' | 'refine' | 'edit' | 'delete', doc: AppDocument) => void;
}) {
  const isCv = doc.document_type === 'CV';
  const sects = doc.sections_included || [];

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/40 hover:bg-gray-800/60 transition-colors overflow-hidden">
      {/* Top strip */}
      <div className={`h-0.5 ${isCv ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-green-600 to-emerald-600'}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
              isCv
                ? 'bg-blue-900/60 text-blue-300 border border-blue-800/50'
                : 'bg-green-900/60 text-green-300 border border-green-800/50'
            }`}>
              {isCv ? 'CV' : 'COVER LETTER'}
            </span>
            <span className="text-sm font-bold text-white">v{doc.version}</span>
            {doc.template_id && (
              <span className="text-xs text-gray-400 capitalize">{doc.template_id}</span>
            )}
            {doc.color_scheme && (
              <span className="text-xs text-gray-600">{doc.color_scheme === 'bw' ? 'B&W' : 'Coloured'}</span>
            )}
            {doc.accent_color && doc.color_scheme !== 'bw' && (
              <div className="w-3.5 h-3.5 rounded-full border border-gray-600 shrink-0" style={{ background: doc.accent_color }} />
            )}
          </div>
          <span className="text-xs text-gray-600 shrink-0">{timeAgo(doc.created_at)}</span>
        </div>

        {/* Section pills */}
        {isCv && sects.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {sects.map(s => (
              <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-gray-700 text-gray-100 border border-gray-600 font-medium">
                {ALL_SECTIONS.find(a => a.key === s)?.label || s}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
          <button onClick={() => onAction('preview', doc)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 transition-colors font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </button>

          <button onClick={() => onAction('refine', doc)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-900/40 hover:bg-indigo-900/70 text-indigo-300 hover:text-indigo-200 border border-indigo-800/50 hover:border-indigo-700 transition-colors font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Refine
          </button>

          <button onClick={() => onAction('edit', doc)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
              doc.is_manually_edited
                ? 'bg-purple-900/50 text-purple-200 border-purple-700 hover:bg-purple-900/70'
                : 'bg-purple-900/30 hover:bg-purple-900/60 text-purple-300 hover:text-purple-200 border-purple-800/50 hover:border-purple-700'
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {doc.is_manually_edited ? 'Edited' : 'Edit'}
          </button>

          <button
            onClick={() => adminApi.downloadCvDocument(
              appId, doc.id,
              `${isCv ? 'CV' : 'CoverLetter'}-v${doc.version}-${appName.replace(/\s+/g, '-')}.pdf`
            )}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 transition-colors font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PDF
          </button>

          <div className="flex-1" />

          <button onClick={() => onAction('delete', doc)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg hover:bg-red-900/30 text-gray-600 hover:text-red-400 border border-transparent hover:border-red-800/40 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function ApplicationDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [app,          setApp]          = useState<Application | null>(null);
  const [job,          setJob]          = useState<Job | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [note,         setNote]         = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [showCvDrawer,    setShowCvDrawer]    = useState(false);
  const [showClDrawer,    setShowClDrawer]    = useState(false);
  const [generating,      setGenerating]      = useState(false);
  const [generateError,   setGenerateError]   = useState<string | null>(null);
  const [lastGenType,     setLastGenType]     = useState<string | null>(null);

  const [previewDoc,  setPreviewDoc]  = useState<AppDocument | null>(null);
  const [refineDoc,   setRefineDoc]   = useState<AppDocument | null>(null);
  const [editDoc,     setEditDoc]     = useState<AppDocument | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<AppDocument | null>(null);
  const [deleteLoading,    setDeleteLoading]    = useState(false);

  const [emailResponses, setEmailResponses] = useState<AppEmailResponse[]>([]);
  const [emailsLoading,  setEmailsLoading]  = useState(true);

  // Status change
  const [statusChanging,    setStatusChanging]    = useState(false);
  const [statusChangeNote,  setStatusChangeNote]  = useState('');
  const [showStatusMenu,    setShowStatusMenu]    = useState(false);

  // Contacts
  const [showContactForm,  setShowContactForm]  = useState(false);
  const [contactFormData,  setContactFormData]  = useState({ name: '', title: '', email: '', linkedin_url: '', role: 'recruiter', notes: '' });
  const [contactSaving,    setContactSaving]    = useState(false);

  // Reminders
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderFormData, setReminderFormData] = useState({ title: '', remind_at: '', reminder_type: 'follow_up' });
  const [reminderSaving,   setReminderSaving]   = useState(false);

  // ── Section tab ─────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<'overview' | 'interview' | 'comms' | 'research'>('overview');

  // ── Interview Q&A ────────────────────────────────────────────
  const [interviewQs,      setInterviewQs]      = useState<Array<{ id: number; question_type: string; question: string; difficulty?: string; hint?: string; star_theme?: string; answered: boolean }>>([]);
  const [iqLoading,        setIqLoading]        = useState(false);
  const [iqGenerating,     setIqGenerating]     = useState(false);
  const [debrief,          setDebrief]          = useState({ went_well: '', improve: '', rating: '' });
  const [debriefSaving,    setDebriefSaving]    = useState(false);

  // ── Communications ───────────────────────────────────────────
  const [comms,          setComms]          = useState<Array<{ id: number; direction: string; channel: string; subject?: string; body_preview?: string; sent_at: string }>>([]);
  const [commsLoading,   setCommsLoading]   = useState(false);
  const [showCommsForm,  setShowCommsForm]  = useState(false);
  const [commsForm,      setCommsForm]      = useState({ direction: 'OUTBOUND', channel: 'email', subject: '', body_preview: '' });
  const [commsSaving,    setCommsSaving]    = useState(false);
  const [linkedIn,       setLinkedIn]       = useState<Array<{ id: number; target_name: string; connection_note?: string; status: string; sent_at?: string }>>([]);
  const [liLoading,      setLiLoading]      = useState(false);

  // ── Company Research ─────────────────────────────────────────
  const [research,       setResearch]       = useState<Record<string, unknown>>({});
  const [resLoading,     setResLoading]     = useState(false);
  const [resSaving,      setResSaving]      = useState(false);

  // Interview prep
  const [prepSaving,       setPrepSaving]       = useState(false);

  const fetchApp = useCallback(async () => {
    try {
      const data: Application = await adminApi.getApplication(id);
      setApp(data);
      if (data.job_id) adminApi.getJob(data.job_id).then(setJob).catch(() => {});
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (msg.includes('404') || msg.includes('not found')) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchApp(); }, [fetchApp]);

  useEffect(() => {
    if (!id) return;
    setEmailsLoading(true);
    adminApi.getAppEmailResponses(id)
      .then((data: unknown) => setEmailResponses((data as { emails?: AppEmailResponse[] }).emails ?? []))
      .catch(() => setEmailResponses([]))
      .finally(() => setEmailsLoading(false));
  }, [id]);

  // Load section-specific data on tab switch
  useEffect(() => {
    if (!id) return;
    if (activeSection === 'interview' && interviewQs.length === 0 && !iqLoading) {
      setIqLoading(true);
      adminApi.getInterviewQuestions(Number(id))
        .then((d: unknown) => setInterviewQs((d as { questions?: typeof interviewQs }).questions ?? []))
        .catch(() => {})
        .finally(() => setIqLoading(false));
    }
    if (activeSection === 'comms' && comms.length === 0 && !commsLoading) {
      setCommsLoading(true);
      setLiLoading(true);
      Promise.allSettled([
        adminApi.getAppCommunications(Number(id)),
        adminApi.getLinkedInOutreach(Number(id)),
      ]).then(([c, li]) => {
        if (c.status === 'fulfilled') setComms((c.value as { communications?: typeof comms }).communications ?? []);
        if (li.status === 'fulfilled') setLinkedIn((li.value as { outreach?: typeof linkedIn }).outreach ?? []);
      }).finally(() => { setCommsLoading(false); setLiLoading(false); });
    }
    if (activeSection === 'research' && !resLoading && Object.keys(research).length === 0) {
      setResLoading(true);
      adminApi.getCompanyResearch(Number(id))
        .then((d: unknown) => setResearch((d as Record<string, unknown>) ?? {}))
        .catch(() => {})
        .finally(() => setResLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, id]);

  async function handleStatusChange(newStatus: string) {
    if (!app || statusChanging) return;
    setStatusChanging(true);
    setShowStatusMenu(false);
    try {
      await adminApi.patchApplicationStatus(id, newStatus, statusChangeNote || undefined);
      setStatusChangeNote('');
      await fetchApp();
    } catch (err: unknown) { alert((err as Error).message || 'Failed'); }
    finally { setStatusChanging(false); }
  }

  async function handleAddContact() {
    if (!contactFormData.name.trim()) return;
    setContactSaving(true);
    try {
      await adminApi.addContact(id, contactFormData);
      setContactFormData({ name: '', title: '', email: '', linkedin_url: '', role: 'recruiter', notes: '' });
      setShowContactForm(false);
      await fetchApp();
    } catch (err: unknown) { alert((err as Error).message || 'Failed'); }
    finally { setContactSaving(false); }
  }

  async function handleDeleteContact(cid: number) {
    if (!window.confirm('Remove this contact?')) return;
    try { await adminApi.deleteContact(id, cid); await fetchApp(); }
    catch (err: unknown) { alert((err as Error).message || 'Failed'); }
  }

  async function handleAddReminder() {
    if (!reminderFormData.title.trim() || !reminderFormData.remind_at) return;
    setReminderSaving(true);
    try {
      await adminApi.addReminder(id, reminderFormData);
      setReminderFormData({ title: '', remind_at: '', reminder_type: 'follow_up' });
      setShowReminderForm(false);
      await fetchApp();
    } catch (err: unknown) { alert((err as Error).message || 'Failed'); }
    finally { setReminderSaving(false); }
  }

  async function handleToggleReminder(rid: number, is_done: boolean) {
    try { await adminApi.patchReminder(id, rid, { is_done }); await fetchApp(); }
    catch (err: unknown) { alert((err as Error).message || 'Failed'); }
  }

  async function handleTogglePrepItem(idx: number) {
    if (!app?.interview_prep) return;
    setPrepSaving(true);
    const prep = { ...app.interview_prep };
    const checklist = [...(prep.checklist || [])];
    checklist[idx] = { ...checklist[idx], done: !checklist[idx].done };
    prep.checklist = checklist;
    try { await adminApi.updateInterviewPrep(id, prep as Record<string, unknown>); await fetchApp(); }
    catch { /* non-fatal */ }
    finally { setPrepSaving(false); }
  }

  async function handleMarkApplied() {
    if (!app) return;
    setActionBusy('applied');
    try {
      await adminApi.patchApplicationStatus(id, 'APPLIED');
      await fetchApp();
    } catch (err: unknown) { alert((err as Error).message || 'Failed'); }
    finally { setActionBusy(null); }
  }

  async function handleArchive() {
    if (!app || !window.confirm(`Archive application for ${app.company_name}?`)) return;
    setActionBusy('archive');
    try {
      await adminApi.archiveApplication(app.id);
      router.push('/dashboard/applications');
    } catch (err: unknown) { alert((err as Error).message || 'Failed'); setActionBusy(null); }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setNoteSubmitting(true);
    try { await adminApi.addNote(id, note.trim()); setNote(''); await fetchApp(); }
    catch (err: unknown) { alert((err as Error).message || 'Failed'); }
    finally { setNoteSubmitting(false); }
  }

  async function handleGenerateCv(config: GenerationConfig) {
    setGenerating(true);
    setGenerateError(null);
    setLastGenType('cv');
    try {
      await adminApi.generateCv(id, config);
      setShowCvDrawer(false);
      await fetchApp();
    } catch (err: unknown) {
      setGenerateError((err as Error).message || 'CV generation failed. Check API logs.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateCoverLetter(config: CoverLetterConfig) {
    setGenerating(true);
    setGenerateError(null);
    setLastGenType('cl');
    try {
      await adminApi.generateCoverLetter(id, config);
      setShowClDrawer(false);
      await fetchApp();
    } catch (err: unknown) {
      setGenerateError((err as Error).message || 'Cover letter generation failed. Check API logs.');
    } finally {
      setGenerating(false);
    }
  }

  function handleDocAction(action: 'preview' | 'refine' | 'edit' | 'delete', doc: AppDocument) {
    if (action === 'preview') setPreviewDoc(doc);
    if (action === 'refine')  setRefineDoc(doc);
    if (action === 'edit')    setEditDoc(doc);
    if (action === 'delete')  setDeleteConfirmDoc(doc);
  }

  async function handleDeleteDoc() {
    if (!deleteConfirmDoc || !app) return;
    setDeleteLoading(true);
    try {
      await adminApi.deleteDocument(app.id, deleteConfirmDoc.id);
      setDeleteConfirmDoc(null);
      await fetchApp();
    } catch (err: unknown) {
      alert((err as Error).message || 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Interview Q&A handlers ───────────────────────────────────
  async function handleGenerateQuestions() {
    if (!id) return;
    setIqGenerating(true);
    try {
      const d = await adminApi.generateInterviewQuestions(Number(id)) as { questions?: typeof interviewQs };
      setInterviewQs(d.questions ?? []);
    } catch (err: unknown) { alert((err as Error).message || 'Generation failed'); }
    finally { setIqGenerating(false); }
  }

  async function handleSaveDebrief() {
    if (!id) return;
    setDebriefSaving(true);
    try {
      await adminApi.saveInterviewDebrief(Number(id), debrief);
    } catch {}
    finally { setDebriefSaving(false); }
  }

  // ── Communications handlers ──────────────────────────────────
  async function handleAddComm() {
    if (!id || !commsForm.channel) return;
    setCommsSaving(true);
    try {
      await adminApi.addAppCommunication(Number(id), commsForm);
      const d = await adminApi.getAppCommunications(Number(id)) as { communications?: typeof comms };
      setComms(d.communications ?? []);
      setCommsForm({ direction: 'OUTBOUND', channel: 'email', subject: '', body_preview: '' });
      setShowCommsForm(false);
    } catch {}
    finally { setCommsSaving(false); }
  }

  // ── Company Research handler ─────────────────────────────────
  async function handleSaveResearch() {
    if (!id) return;
    setResSaving(true);
    try {
      await adminApi.saveCompanyResearch(Number(id), research);
    } catch {}
    finally { setResSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-8 bg-gray-800 rounded w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            {[180, 120, 200].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 h-32" />
            ))}
          </div>
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5 h-48" />
        </div>
      </div>
    );
  }

  if (notFound || !app) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-gray-400 text-lg mb-4">Application not found.</p>
        <Link href="/dashboard/applications"
          className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 text-sm transition-colors">
          ← Back to Applications
        </Link>
      </div>
    );
  }

  const isApplied  = PAST_APPLIED.has(app.status);
  const sortedEvts = [...(app.events || [])].sort((a, b) =>
    new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
  );

  const cvDocs = app.documents.filter(d => d.document_type === 'CV');
  const clDocs = app.documents.filter(d => d.document_type === 'COVER_LETTER');

  const currentStageIdx = FORWARD_STATUSES.indexOf(app?.status || '');
  const isClosed = CLOSED_STATUSES.includes(app?.status || '');

  // Status node colour
  function nodeClass(stageValue: string, stageIdx: number) {
    if (stageValue === (app?.status || '')) return 'bg-indigo-600 border-indigo-500 text-white ring-2 ring-indigo-400/30';
    if (stageIdx < currentStageIdx && !isClosed) return 'bg-green-700/60 border-green-600 text-green-200';
    return 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300';
  }
  function nodeConnector(stageIdx: number) {
    return stageIdx < currentStageIdx && !isClosed ? 'bg-green-700/40' : 'bg-gray-800';
  }

  return (
    <>
      {/* Global CSS for label utility */}
      <style>{`.label-xs { font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgb(156 163 175); }`}</style>

      {/* ── Overlays ── */}
      {showCvDrawer && (
        <GenerationDrawer
          job={job}
          appId={id}
          latestCvDocId={cvDocs[0]?.id ?? null}
          latestCvDoc={cvDocs[0] ?? null}
          onGenerate={handleGenerateCv}
          generating={generating && lastGenType === 'cv'}
          onClose={() => setShowCvDrawer(false)}
        />
      )}
      {showClDrawer && (
        <CoverLetterDrawer
          documents={app.documents}
          onGenerate={handleGenerateCoverLetter}
          generating={generating && lastGenType === 'cl'}
          onClose={() => setShowClDrawer(false)}
        />
      )}
      {previewDoc && (
        <PreviewModal
          appId={id}
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
      {refineDoc && (
        <RefineModal
          appId={id}
          doc={refineDoc}
          onClose={() => setRefineDoc(null)}
          onDone={async () => { setRefineDoc(null); await fetchApp(); }}
        />
      )}
      {editDoc && (
        <EditDocumentModal
          appId={id}
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={async () => { setEditDoc(null); await fetchApp(); }}
        />
      )}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-sm font-bold text-white mb-2">Delete document?</h3>
            <p className="text-xs text-gray-400 mb-5">
              This will permanently delete{' '}
              <span className="text-white font-semibold">
                {deleteConfirmDoc.document_type === 'CV' ? 'CV' : 'Cover Letter'} v{deleteConfirmDoc.version}
              </span>. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <button onClick={() => setDeleteConfirmDoc(null)} disabled={deleteLoading}
                className="px-4 py-2 text-sm rounded-xl bg-gray-800 text-gray-400 hover:text-white border border-gray-700 transition-colors font-medium disabled:opacity-40">
                Cancel
              </button>
              <button onClick={handleDeleteDoc} disabled={deleteLoading}
                className="px-5 py-2 text-sm rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold disabled:opacity-40 transition-colors flex items-center gap-2">
                {deleteLoading ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Deleting…</>
                ) : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page ── */}
      <div className="flex flex-col gap-4">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/dashboard/applications" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Applications
            </Link>
            <h1 className="text-xl font-bold text-white leading-tight truncate mt-1">{app.job_title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-gray-400 text-sm">{app.company_name}</span>
              {app.match_score !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${scoreBadge(app.match_score)}`}>
                  {Math.round(parseFloat(String(app.match_score)))} match
                </span>
              )}
              {app.source_platform && (
                <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-md border border-gray-700">
                  {app.source_platform}
                  {app.entry_method === 'paste' && ' · manual'}
                </span>
              )}
              {(app.source_url || app.job_url) && (
                <a href={app.source_url || app.job_url || ''} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                  View posting ↗
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="relative">
              <button onClick={() => setShowStatusMenu(v => !v)}
                disabled={statusChanging}
                className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors border
                  ${statusBadge(app.status)} border-transparent hover:border-current disabled:opacity-40`}>
                {statusChanging ? 'Updating…' : `${app.status.replace(/_/g, ' ')} ▾`}
              </button>
              {showStatusMenu && (
                <div className="absolute right-0 top-8 z-30 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-52 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-800">
                    <p className="text-xs text-gray-500">Change status</p>
                    <input value={statusChangeNote} onChange={e => setStatusChangeNote(e.target.value)}
                      placeholder="Optional note…"
                      className="w-full bg-gray-800 text-xs text-white rounded px-2 py-1 mt-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {STATUS_PIPELINE_STAGES.map(s => (
                      <button key={s.value} onClick={() => handleStatusChange(s.value)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-800
                          ${s.value === app.status ? 'text-indigo-400 font-bold' : 'text-gray-300'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleArchive} disabled={actionBusy === 'archive'}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-800/50 disabled:opacity-40 transition-colors">
              {actionBusy === 'archive' ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </div>

        {/* ── Status Pipeline ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {STATUS_PIPELINE_STAGES.filter(s => !['DECLINED_OFFER','NEGOTIATING','WITHDRAWN','GHOSTED','NO_RESPONSE','ARCHIVED'].includes(s.value)).map((stage, idx, arr) => (
              <div key={stage.value} className="flex items-center">
                <button
                  onClick={() => handleStatusChange(stage.value)}
                  disabled={statusChanging}
                  title={`Set to ${stage.label}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${nodeClass(stage.value, FORWARD_STATUSES.indexOf(stage.value))}`}
                >
                  {stage.label}
                </button>
                {idx < arr.length - 1 && (
                  <div className={`w-6 h-0.5 ${nodeConnector(FORWARD_STATUSES.indexOf(stage.value))}`} />
                )}
              </div>
            ))}
            {/* Closed outcomes */}
            <div className="w-6 h-0.5 bg-gray-800" />
            <div className="flex gap-1.5">
              {['REJECTED','WITHDRAWN','GHOSTED'].map(s => (
                <button key={s} onClick={() => handleStatusChange(s)} disabled={statusChanging}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${nodeClass(s, 99)}`}>
                  {STATUS_PIPELINE_STAGES.find(x => x.value === s)?.label || s}
                </button>
              ))}
            </div>
          </div>
          {/* AI intelligence row */}
          {(app.strongest_angle || app.cover_letter_hook) && (
            <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {app.strongest_angle && (
                <div className="text-xs text-gray-500">
                  <span className="text-indigo-400 font-semibold">Strongest angle: </span>{app.strongest_angle}
                </div>
              )}
              {app.cover_letter_hook && (
                <div className="text-xs text-gray-500 italic">
                  <span className="text-green-400 font-semibold not-italic">Hook: </span>&ldquo;{app.cover_letter_hook}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Section tab bar ──────────────────────────────── */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {([
            { key: 'overview',  label: 'Overview'   },
            { key: 'interview', label: 'Interview'  },
            { key: 'comms',     label: 'Comms'      },
            { key: 'research',  label: 'Research'   },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveSection(t.key)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={activeSection === t.key ? {
                background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(79,70,229,0.25))',
                color: '#DDD6FE',
                boxShadow: '0 2px 8px rgba(168,85,247,0.2)',
              } : { color: 'rgba(255,255,255,0.45)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Main grid (overview only) ─────────────────────── */}
        {activeSection !== 'overview' ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

          {/* Left: 3/5 */}
          <div className="lg:col-span-3 flex flex-col gap-4">

            {/* Job Information */}
            <Section title="Job Information">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {app.source_platform && (
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-md border border-gray-700">{app.source_platform}</span>
                  )}
                  {app.match_score !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded-md font-bold ${scoreBadge(app.match_score)}`}>
                      Score: {Math.round(parseFloat(String(app.match_score)))}
                    </span>
                  )}
                  {app.job_url && (
                    <a href={app.job_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                      View posting ↗
                    </a>
                  )}
                </div>
                {job?.description ? (
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</p>
                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap overflow-y-auto rounded-xl bg-gray-800/50 p-4 border border-gray-700/50"
                      style={{ maxHeight: '200px' }}>
                      {job.description}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 italic">No job description available.</p>
                )}
              </div>
            </Section>

            {/* Documents */}
            <Section
              title="Documents"
              action={
                <div className="flex gap-2">
                  <button onClick={() => setShowCvDrawer(true)} disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {cvDocs.length > 0 ? 'New CV' : 'Generate CV'}
                  </button>
                  <button onClick={() => setShowClDrawer(true)} disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-700 hover:bg-green-600 text-white font-semibold disabled:opacity-40 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {clDocs.length > 0 ? 'New Cover Letter' : 'Cover Letter'}
                  </button>
                </div>
              }
            >
              {/* Error */}
              {generateError && (
                <div className="mb-4 p-3 rounded-xl bg-red-900/20 border border-red-800/30 text-xs text-red-400 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {generateError}
                </div>
              )}

              {/* Progress */}
              {generating && (
                <div className="mb-4 flex items-center gap-3 p-4 rounded-xl bg-indigo-900/20 border border-indigo-800/30 text-sm text-indigo-300">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <div>
                    <p className="font-semibold">{lastGenType === 'cl' ? 'Generating cover letter…' : 'Generating tailored CV…'}</p>
                    <p className="text-xs text-indigo-400/70 mt-0.5">This may take 20–45 seconds</p>
                  </div>
                </div>
              )}

              {/* CV versions */}
              {cvDocs.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    CV Versions
                    <span className="font-normal text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded-full">{cvDocs.length}</span>
                  </p>
                  <div className="space-y-2.5">
                    {cvDocs.map(doc => (
                      <DocCard key={doc.id} doc={doc} appId={id} appName={app.company_name} onAction={handleDocAction} />
                    ))}
                  </div>
                </div>
              )}

              {/* Cover letters */}
              {clDocs.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    Cover Letters
                    <span className="font-normal text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded-full">{clDocs.length}</span>
                  </p>
                  <div className="space-y-2.5">
                    {clDocs.map(doc => (
                      <DocCard key={doc.id} doc={doc} appId={id} appName={app.company_name} onAction={handleDocAction} />
                    ))}
                  </div>
                </div>
              )}

              {app.documents.length === 0 && !generating && (
                <div className="py-8 text-center">
                  <p className="text-gray-600 text-sm mb-1">No documents yet.</p>
                  <p className="text-gray-700 text-xs">Click Generate CV or Cover Letter above to get started.</p>
                </div>
              )}
            </Section>

            {/* ── Contacts ── */}
            <Section title="People" action={
              <button onClick={() => setShowContactForm(v => !v)}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors">
                + Add Contact
              </button>
            }>
              {showContactForm && (
                <div className="mb-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'name', placeholder: 'Name *', required: true },
                      { key: 'title', placeholder: 'Job Title' },
                      { key: 'email', placeholder: 'Email' },
                      { key: 'linkedin_url', placeholder: 'LinkedIn URL' },
                    ].map(({ key, placeholder }) => (
                      <input key={key} value={(contactFormData as Record<string, string>)[key]} placeholder={placeholder}
                        onChange={e => setContactFormData(p => ({ ...p, [key]: e.target.value }))}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                      />
                    ))}
                  </div>
                  <select value={contactFormData.role} onChange={e => setContactFormData(p => ({ ...p, role: e.target.value }))}
                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                    {['recruiter','hiring_manager','interviewer','other'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleAddContact} disabled={contactSaving || !contactFormData.name.trim()}
                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 transition-colors">
                      {contactSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setShowContactForm(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancel</button>
                  </div>
                </div>
              )}
              {(app.contacts || []).length === 0 && !showContactForm ? (
                <p className="text-xs text-gray-600 italic py-2">No contacts yet — add recruiters, hiring managers, interviewers.</p>
              ) : (
                <div className="space-y-2">
                  {(app.contacts || []).map(c => (
                    <div key={c.id} className="flex items-start justify-between gap-3 p-3 bg-gray-800/40 border border-gray-700/50 rounded-xl">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{c.name}</span>
                          <span className="text-xs text-gray-600 px-1.5 py-0.5 bg-gray-800 rounded">{c.role.replace('_',' ')}</span>
                        </div>
                        {c.title && <p className="text-xs text-gray-400">{c.title}</p>}
                        <div className="flex items-center gap-3 mt-1">
                          {c.email && <a href={`mailto:${c.email}`} className="text-xs text-indigo-400 hover:text-indigo-300">{c.email}</a>}
                          {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">LinkedIn ↗</a>}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteContact(c.id)} className="text-gray-700 hover:text-red-400 text-xs transition-colors">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Reminders ── */}
            <Section title="Reminders" action={
              <button onClick={() => setShowReminderForm(v => !v)}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors">
                + Add Reminder
              </button>
            }>
              {showReminderForm && (
                <div className="mb-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3">
                  <input value={reminderFormData.title} placeholder="Reminder title *"
                    onChange={e => setReminderFormData(p => ({ ...p, title: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="datetime-local" value={reminderFormData.remind_at}
                      onChange={e => setReminderFormData(p => ({ ...p, remind_at: e.target.value }))}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    <select value={reminderFormData.reminder_type}
                      onChange={e => setReminderFormData(p => ({ ...p, reminder_type: e.target.value }))}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                      {['follow_up','interview_prep','deadline','custom'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddReminder} disabled={reminderSaving || !reminderFormData.title.trim() || !reminderFormData.remind_at}
                      className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 transition-colors">
                      {reminderSaving ? 'Saving…' : 'Save Reminder'}
                    </button>
                    <button onClick={() => setShowReminderForm(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancel</button>
                  </div>
                </div>
              )}
              {(app.reminders || []).length === 0 && !showReminderForm ? (
                <p className="text-xs text-gray-600 italic py-2">No reminders set.</p>
              ) : (
                <div className="space-y-2">
                  {(app.reminders || []).map(r => {
                    const overdue = !r.is_done && new Date(r.remind_at) < new Date();
                    return (
                      <div key={r.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors
                        ${r.is_done ? 'bg-gray-800/20 border-gray-800 opacity-50' : overdue ? 'bg-red-900/20 border-red-800/40' : 'bg-gray-800/40 border-gray-700/50'}`}>
                        <button onClick={() => handleToggleReminder(r.id, !r.is_done)}
                          className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                            ${r.is_done ? 'bg-green-700 border-green-700' : 'border-gray-600 hover:border-indigo-500'}`}>
                          {r.is_done && <span className="text-white text-xs leading-none">✓</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${r.is_done ? 'line-through text-gray-600' : 'text-white'}`}>{r.title}</p>
                          <p className={`text-xs mt-0.5 ${overdue && !r.is_done ? 'text-red-400' : 'text-gray-500'}`}>
                            {overdue && !r.is_done ? '⚠ Overdue · ' : ''}
                            {new Date(r.remind_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* ── Interview Prep ── */}
            {app.interview_prep && (
              (app.interview_prep.tech_to_review?.length || app.interview_prep.key_requirements?.length || app.interview_prep.checklist?.length) ? (
                <Section title="Interview Preparation">
                  {app.interview_prep.tech_to_review && app.interview_prep.tech_to_review.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tech to review</p>
                      <div className="flex flex-wrap gap-1.5">
                        {app.interview_prep.tech_to_review.map(t => (
                          <span key={t} className="px-2.5 py-1 text-xs bg-blue-900/30 text-blue-300 border border-blue-800/40 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {app.interview_prep.key_requirements && app.interview_prep.key_requirements.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Key requirements to address</p>
                      <ul className="space-y-1">
                        {app.interview_prep.key_requirements.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                            <span className="text-indigo-500 mt-0.5">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {app.interview_prep.checklist && app.interview_prep.checklist.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Checklist</p>
                      <div className="space-y-1">
                        {app.interview_prep.checklist.map((item, idx) => (
                          <button key={idx} onClick={() => handleTogglePrepItem(idx)} disabled={prepSaving}
                            className="w-full flex items-start gap-2 text-left py-1 group">
                            <div className={`w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                              ${item.done ? 'bg-green-700 border-green-700' : 'border-gray-600 group-hover:border-indigo-500'}`}>
                              {item.done && <span className="text-white text-xs leading-none">✓</span>}
                            </div>
                            <span className={`text-xs ${item.done ? 'line-through text-gray-600' : 'text-gray-300'}`}>{item.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              ) : null
            )}

            {/* Email Responses */}
            <Section title="Email Responses">
              {emailsLoading ? (
                <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-gray-800 rounded-lg" />)}</div>
              ) : emailResponses.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-3">No emails linked to this application yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {emailResponses.map(er => {
                    const cls: Record<string, string> = {
                      INTERVIEW_INVITE: 'bg-green-900/40 text-green-400 border border-green-800/40',
                      OFFER:            'bg-emerald-900/40 text-emerald-400 border border-emerald-800/40',
                      TECHNICAL_TEST:   'bg-blue-900/40 text-blue-400 border border-blue-800/40',
                      REJECTION:        'bg-red-900/40 text-red-400 border border-red-800/40',
                      FOLLOW_UP_NEEDED: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800/40',
                      GENERAL_RESPONSE: 'bg-gray-800 text-gray-400 border border-gray-700',
                      UNKNOWN:          'bg-gray-800 text-gray-500 border border-gray-700',
                    };
                    return (
                      <div key={er.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-700/50">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-200 truncate">{er.subject || '(no subject)'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{er.sender_name ? `${er.sender_name} · ` : ''}{er.sender_email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${cls[er.ai_classification] ?? cls['UNKNOWN']}`}>
                            {er.ai_classification.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-gray-600">{er.received_at ? timeAgo(er.received_at) : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                  <Link href="/dashboard/email-tracking" className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 text-right block">
                    View all →
                  </Link>
                </div>
              )}
            </Section>

            {/* Notes */}
            <Section title="Notes">
              {app.notes ? (
                <div className="mb-4 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50 text-sm text-gray-300 whitespace-pre-wrap">
                  {app.notes}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic mb-4">No notes yet.</p>
              )}
              <form onSubmit={handleAddNote} className="space-y-2">
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder:text-gray-600 resize-none focus:outline-none focus:border-indigo-500 transition-colors" />
                <button type="submit" disabled={noteSubmitting || !note.trim()}
                  className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-40 transition-colors">
                  {noteSubmitting ? 'Saving…' : 'Add Note'}
                </button>
              </form>
            </Section>
          </div>

          {/* Right: 2/5 — Timeline */}
          <div className="lg:col-span-2">
            <Section title="Status & Timeline">
              {sortedEvts.length === 0 ? (
                <p className="text-xs text-gray-600 italic">No events yet.</p>
              ) : (
                <ol className="relative">
                  {sortedEvts.map((ev, idx) => {
                    const isLast = idx === sortedEvts.length - 1;
                    return (
                      <li key={ev.id} className="flex gap-3 pb-5 relative">
                        {!isLast && <div className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-700" />}
                        <span className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ring-2 ring-gray-900 z-10 ${eventDot(ev.event_type)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-200 leading-tight">{ev.event_type.replace(/_/g, ' ')}</p>
                          {ev.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{ev.description}</p>}
                          <p className="text-xs text-gray-600 mt-1">{timeAgo(ev.event_date)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
          </div>
        </div>
        )} {/* end overview */}

        {/* ── Interview tab ─────────────────────────────────── */}
        {activeSection === 'interview' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 flex flex-col gap-4">
              {/* AI Q&A */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold" style={{ color: '#DDD6FE' }}>Interview Questions</p>
                  <button
                    onClick={handleGenerateQuestions}
                    disabled={iqGenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}
                  >
                    {iqGenerating ? 'Generating…' : interviewQs.length ? 'Re-generate' : 'Generate with AI'}
                  </button>
                </div>
                {iqLoading ? (
                  <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</p>
                ) : interviewQs.length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.32)' }}>No questions yet. Generate with AI to get started.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {(['technical', 'behavioral', 'situational', 'company_question'] as const).map(type => {
                      const qs = interviewQs.filter(q => q.question_type === type);
                      if (!qs.length) return null;
                      const typeLabel = { technical: 'Technical', behavioral: 'Behavioral', situational: 'Situational', company_question: 'Questions to Ask' }[type];
                      const typeColor = { technical: '#60a5fa', behavioral: '#DDD6FE', situational: '#fbbf24', company_question: '#4ade80' }[type];
                      return (
                        <div key={type}>
                          <p className="text-xs font-bold mb-2" style={{ color: typeColor }}>{typeLabel}</p>
                          {qs.map(q => (
                            <div key={q.id} className="mb-2 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.92)' }}>{q.question}</p>
                              {q.hint && <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>💡 {q.hint}</p>}
                              {q.difficulty && <span className="text-xs px-2 py-0.5 rounded-full mt-1.5 inline-block" style={{ background: 'rgba(255,255,255,0.08)', color: '#DDD6FE' }}>{q.difficulty}</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Post-interview debrief */}
              {['INTERVIEW_INVITE','INTERVIEW_SCHEDULED','TECHNICAL_TEST','FINAL_INTERVIEW','OFFER','REJECTED'].includes(app.status) && (
                <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className="text-sm font-semibold mb-4" style={{ color: '#DDD6FE' }}>Post-Interview Debrief</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>What went well?</label>
                      <textarea value={debrief.went_well} onChange={e => setDebrief(p => ({ ...p, went_well: e.target.value }))} rows={3}
                        className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>What to improve?</label>
                      <textarea value={debrief.improve} onChange={e => setDebrief(p => ({ ...p, improve: e.target.value }))} rows={3}
                        className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Self-rating (1–10)</label>
                      <input type="number" min={1} max={10} value={debrief.rating} onChange={e => setDebrief(p => ({ ...p, rating: e.target.value }))}
                        className="w-24 px-3 py-2 rounded-xl text-sm"
                        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                    </div>
                    <button onClick={handleSaveDebrief} disabled={debriefSaving}
                      className="self-start px-4 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: 'rgba(168,85,247,0.2)', color: '#DDD6FE' }}>
                      {debriefSaving ? 'Saving…' : 'Save Debrief'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: '#DDD6FE' }}>Prep Checklist</p>
                {app.interview_prep?.checklist?.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: item.done ? '#4ade80' : 'rgba(255,255,255,0.18)', background: item.done ? 'rgba(74,222,128,0.15)' : 'transparent' }}>
                      {item.done && <span className="text-xs" style={{ color: '#4ade80' }}>✓</span>}
                    </div>
                    <p className="text-xs" style={{ color: item.done ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.75)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</p>
                  </div>
                )) || <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>No checklist items.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Communications tab ───────────────────────────── */}
        {activeSection === 'comms' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold" style={{ color: '#DDD6FE' }}>Communication Log</p>
                <button onClick={() => setShowCommsForm(p => !p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(168,85,247,0.15)', color: '#DDD6FE' }}>
                  + Log
                </button>
              </div>
              {showCommsForm && (
                <div className="mb-4 p-4 rounded-xl flex flex-col gap-3" style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Direction</label>
                      <select value={commsForm.direction} onChange={e => setCommsForm(p => ({ ...p, direction: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-xs"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}>
                        <option value="OUTBOUND">Outbound (you sent)</option>
                        <option value="INBOUND">Inbound (you received)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.65)' }}>Channel</label>
                      <select value={commsForm.channel} onChange={e => setCommsForm(p => ({ ...p, channel: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-xs"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }}>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="in_person">In person</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <input type="text" value={commsForm.subject} onChange={e => setCommsForm(p => ({ ...p, subject: e.target.value }))}
                    placeholder="Subject / Summary"
                    className="w-full px-3 py-2 rounded-lg text-xs"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                  <textarea value={commsForm.body_preview} onChange={e => setCommsForm(p => ({ ...p, body_preview: e.target.value }))}
                    placeholder="Notes or preview…" rows={2}
                    className="w-full px-3 py-2 rounded-lg text-xs resize-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                  <div className="flex gap-2">
                    <button onClick={handleAddComm} disabled={commsSaving}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)', color: '#fff' }}>
                      {commsSaving ? 'Saving…' : 'Log it'}
                    </button>
                    <button onClick={() => setShowCommsForm(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(0,0,0,0.25)' }}>Cancel</button>
                  </div>
                </div>
              )}
              {commsLoading ? <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</p> : comms.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.32)' }}>No communications logged yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {comms.map(c => (
                    <div key={c.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,0,0,0.22)' }}>
                      <div className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                        style={{ background: c.direction === 'OUTBOUND' ? '#A855F7' : '#4ade80' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>{c.subject || `${c.channel} communication`}</p>
                        {c.body_preview && <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>{c.body_preview}</p>}
                      </div>
                      <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.32)' }}>{new Date(c.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LinkedIn outreach */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: '#DDD6FE' }}>LinkedIn Outreach</p>
              {liLoading ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</p> : linkedIn.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>No LinkedIn outreach recorded for this application.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {linkedIn.map(li => (
                    <div key={li.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,0,0,0.22)' }}>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>{li.target_name}</p>
                        {li.connection_note && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{li.connection_note}</p>}
                      </div>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#DDD6FE' }}>{li.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Research tab ─────────────────────────────────── */}
        {activeSection === 'research' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm font-semibold" style={{ color: '#DDD6FE' }}>Company Research</p>
                <button onClick={handleSaveResearch} disabled={resSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(168,85,247,0.2)', color: '#DDD6FE' }}>
                  {resSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {resLoading ? <p className="text-xs" style={{ color: 'rgba(255,255,255,0.32)' }}>Loading…</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'funding_stage',         label: 'Funding Stage',         ph: 'Series B, Public, etc.' },
                    { key: 'company_size',           label: 'Company Size',          ph: '50-200 employees' },
                    { key: 'glassdoor_rating',       label: 'Glassdoor Rating',      ph: '4.2 / 5' },
                    { key: 'headquarters',           label: 'Headquarters',          ph: 'London, UK' },
                    { key: 'tech_stack',             label: 'Tech Stack',            ph: 'React, Node, AWS…' },
                    { key: 'competitors',            label: 'Main Competitors',      ph: 'Competitor A, B…' },
                    { key: 'recent_news',            label: 'Recent News / Wins',    ph: 'Latest acquisition, launch…' },
                    { key: 'interview_culture_notes', label: 'Culture Notes',        ph: 'Glassdoor interview reviews…' },
                  ].map(({ key, label, ph }) => (
                    <div key={key}>
                      <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{label}</label>
                      <input type="text" value={(research[key] as string) || ''}
                        onChange={e => setResearch(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={ph}
                        className="w-full px-3 py-2 rounded-xl text-xs"
                        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>My Questions to Ask</label>
                    <textarea value={(research.questions_to_ask as string) || ''}
                      onChange={e => setResearch(p => ({ ...p, questions_to_ask: e.target.value }))}
                      placeholder="What does success look like in this role? What's the biggest challenge the team faces?"
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl text-xs resize-none"
                      style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: '#FFFFFF', outline: 'none' }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Research Links / References</label>
                    <textarea value={(research.reference_links as string) || ''}
                      onChange={e => setResearch(p => ({ ...p, reference_links: e.target.value }))}
                      placeholder="https://... (one per line)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl text-xs resize-none font-mono"
                      style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(255,255,255,0.65)', outline: 'none' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
