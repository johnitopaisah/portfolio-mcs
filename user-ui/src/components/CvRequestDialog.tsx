'use client';
// "Get my CV" — the CV is emailed instead of downloaded, so John knows who
// received it. Email is the only required field. Open it from anywhere with
// openCvRequest({ language, source }).
import { useCallback, useEffect, useRef, useState } from 'react';

type Lang = 'en' | 'fr';
type Source = 'hero' | 'navbar' | 'mobile-menu' | 'blog' | 'other';
const EVENT = 'open-cv-request';

export function openCvRequest(detail: { language?: Lang; source?: Source } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

const T = {
  en: {
    title: 'Get my CV by email', lead: 'Choose a language and enter your email — the CV arrives in your inbox in a few seconds.',
    lang: 'Language', email: 'Your email', emailPh: 'you@company.com', optional: 'Optional',
    name: 'Name', company: 'Company', role: 'I am a', roles: { '': '—', recruiter: 'Recruiter', hiring_manager: 'Hiring manager', other: 'Other' },
    consent: 'Send me the CV. John may contact me about opportunities.', privacy: 'Privacy',
    send: 'Send me the CV', sending: 'Sending…', cancel: 'Cancel', close: 'Close',
    sentTitle: 'Check your inbox', sent: (e: string) => `The CV is on its way to ${e}. If you don't see it in a minute, check your spam folder.`,
    already: (e: string) => `The CV was already sent to ${e} today — check your inbox and spam folder.`,
    change: 'Wrong address? Change it', invalid: 'Please enter a valid email address.', needConsent: 'Please tick the box so the CV can be emailed to you.',
  },
  fr: {
    title: 'Recevoir mon CV par e-mail', lead: 'Choisissez la langue et indiquez votre e-mail — le CV arrive dans votre boîte en quelques secondes.',
    lang: 'Langue', email: 'Votre e-mail', emailPh: 'vous@entreprise.com', optional: 'Facultatif',
    name: 'Nom', company: 'Entreprise', role: 'Je suis', roles: { '': '—', recruiter: 'Recruteur·se', hiring_manager: 'Manager', other: 'Autre' },
    consent: "Envoyez-moi le CV. John peut me contacter au sujet d'opportunités.", privacy: 'Confidentialité',
    send: 'Recevoir le CV', sending: 'Envoi…', cancel: 'Annuler', close: 'Fermer',
    sentTitle: 'Consultez votre boîte mail', sent: (e: string) => `Le CV est en route vers ${e}. S'il n'arrive pas d'ici une minute, vérifiez vos spams.`,
    already: (e: string) => `Le CV a déjà été envoyé à ${e} aujourd'hui — vérifiez votre boîte de réception et vos spams.`,
    change: "Mauvaise adresse ? La modifier", invalid: 'Veuillez saisir une adresse e-mail valide.', needConsent: "Veuillez cocher la case pour recevoir le CV par e-mail.",
  },
};

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export default function CvRequestDialog() {
  const [open, setOpen]       = useState(false);
  const [lang, setLang]       = useState<Lang>('en');
  const [source, setSource]   = useState<Source>('other');
  const [email, setEmail]     = useState('');
  const [name, setName]       = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole]       = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');           // honeypot — hidden from people
  const [more, setMore]       = useState(false);
  const [state, setState]     = useState<'form' | 'sending' | 'sent' | 'already'>('form');
  const [error, setError]     = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef  = useRef<HTMLInputElement>(null);
  const opener    = useRef<Element | null>(null);
  const t = T[lang];

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ language?: Lang; source?: Source }>).detail || {};
      opener.current = document.activeElement;
      const browserFr = typeof navigator !== 'undefined' && /^fr\b/i.test(navigator.language || '');
      setLang(d.language || (browserFr ? 'fr' : 'en'));
      setSource(d.source || 'other');
      setState('form'); setError('');
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  // focus first field, Esc closes, Tab stays inside
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => emailRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button, input:not([tabindex="-1"]), select, a[href]');
        const list = Array.from(f).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) { setError(t.invalid); emailRef.current?.focus(); return; }
    if (!consent) { setError(t.needConsent); return; }
    setState('sending');
    try {
      const res = await fetch('/api/cv-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), language: lang, name, company, role: role || undefined, consent, source, website }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Something went wrong — please try again.');
      setState(j.status === 'already_sent' ? 'already' : 'sent');
    } catch (err) {
      setError((err as Error).message); setState('form');
    }
  }

  if (!open) return null;
  const field = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors';
  const fieldStyle = { background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-1)' };
  const label = 'block text-xs font-medium mb-1.5';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(10,5,30,0.55)', backdropFilter: 'blur(6px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cvreq-title" aria-describedby="cvreq-lead"
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-card)', color: 'var(--text-1)' }}>
        {state === 'sent' || state === 'already' ? (
          <div className="text-center py-2" role="status">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }} aria-hidden="true">✓</div>
            <h2 id="cvreq-title" className="text-lg font-semibold mb-2">{t.sentTitle}</h2>
            <p id="cvreq-lead" className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
              {state === 'sent' ? t.sent(email.trim()) : t.already(email.trim())}
            </p>
            <div className="flex flex-col items-center gap-3">
              <button type="button" onClick={close} className="btn-primary text-sm">{t.close}</button>
              <button type="button" onClick={() => { setState('form'); setTimeout(() => emailRef.current?.focus(), 30); }}
                className="text-xs underline underline-offset-4" style={{ color: 'var(--text-2)' }}>{t.change}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 id="cvreq-title" className="text-lg font-semibold">{t.title}</h2>
              <button type="button" onClick={close} aria-label={t.close} className="text-xl leading-none px-1 -mt-1" style={{ color: 'var(--text-3)' }}>×</button>
            </div>
            <p id="cvreq-lead" className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>{t.lead}</p>

            <fieldset className="mb-4">
              <legend className={label} style={{ color: 'var(--text-2)' }}>{t.lang}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(['en', 'fr'] as const).map(l => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => { setLang(l); setError(''); }}
                    className="rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
                    style={lang === l
                      ? { background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.65)', color: 'var(--text-1)' }
                      : { background: 'transparent', border: '1px solid var(--border-input)', color: 'var(--text-2)' }}>
                    <span className="text-xs font-bold tracking-wider mr-1.5 opacity-70">{l.toUpperCase()}</span>{l === 'en' ? 'English' : 'Français'}
                  </button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="cvreq-email" className={label} style={{ color: 'var(--text-2)' }}>{t.email} *</label>
            <input ref={emailRef} id="cvreq-email" type="email" inputMode="email" autoComplete="email" required value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }} placeholder={t.emailPh} maxLength={254}
              aria-invalid={error === t.invalid} className={`${field} mb-3`} style={fieldStyle} />

            <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more}
              className="text-xs mb-3 underline-offset-4 hover:underline" style={{ color: 'var(--text-2)' }}>
              {more ? '−' : '+'} {t.name}, {t.company.toLowerCase()}, {t.role.toLowerCase()} <span style={{ color: 'var(--text-3)' }}>({t.optional.toLowerCase()})</span>
            </button>
            {more && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="cvreq-name" className={label} style={{ color: 'var(--text-2)' }}>{t.name}</label>
                  <input id="cvreq-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={120} className={field} style={fieldStyle} />
                </div>
                <div>
                  <label htmlFor="cvreq-company" className={label} style={{ color: 'var(--text-2)' }}>{t.company}</label>
                  <input id="cvreq-company" autoComplete="organization" value={company} onChange={e => setCompany(e.target.value)} maxLength={160} className={field} style={fieldStyle} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="cvreq-role" className={label} style={{ color: 'var(--text-2)' }}>{t.role}</label>
                  <select id="cvreq-role" value={role} onChange={e => setRole(e.target.value)} className={field} style={fieldStyle}>
                    {Object.entries(t.roles).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* honeypot: invisible to people, bots fill it */}
            <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off"
              aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }} />

            <label className="flex items-start gap-2.5 text-xs mb-4 cursor-pointer" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={consent} onChange={e => { setConsent(e.target.checked); setError(''); }} className="mt-0.5 accent-violet-600" />
              <span>{t.consent} <a href="/privacy#cv-requests" target="_blank" className="underline underline-offset-2">{t.privacy}</a></span>
            </label>

            {error && <p role="alert" className="text-sm mb-3" style={{ color: '#ef4444' }}>{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={close} className="btn-outline text-sm">{t.cancel}</button>
              <button type="submit" disabled={state === 'sending'} className="btn-primary text-sm disabled:opacity-60">
                {state === 'sending' ? t.sending : t.send}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
