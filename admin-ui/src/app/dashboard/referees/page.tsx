'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Referee {
  id: string; name: string; title: string; organization: string;
  relationship: string; review?: string; linkedin_url?: string;
  email?: string; phone?: string;
  available_on_request: boolean; visible: boolean;
  has_photo: boolean; has_org_logo: boolean; order_index: number;
  modification_requested: boolean; modification_requested_at?: string;
}

interface Invitation {
  id: string; note?: string; type: string; expires_at: string;
  used: boolean; used_at?: string; created_at: string;
  referee_id?: string; referee_name?: string; link: string; expired: boolean;
}

const emptyForm = {
  name: '', title: '', organization: '', relationship: '', review: '',
  linkedin_url: '', email: '', phone: '',
  available_on_request: 'true', visible: 'true', order_index: '0',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-xs px-3 py-1 rounded-lg transition-colors"
      style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(124,58,237,0.12)', color: copied ? '#86efac' : '#a78bfa' }}>
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  );
}

function InviteModal({ refereeId, refereeName, onClose, onDone }: {
  refereeId?: string; refereeName?: string; onClose: () => void; onDone: (inv: Invitation) => void;
}) {
  const isModify = !!refereeId;
  const [note, setNote]           = useState(refereeName ? `Modification link for ${refereeName}` : '');
  const [days, setDays]           = useState('14');
  const [refereeEmail, setRefereeEmail] = useState('');
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<(Invitation & { email_sent?: boolean }) | null>(null);

  async function generate() {
    setSaving(true);
    try {
      const payload = { note, days: parseInt(days), referee_email: refereeEmail.trim() || undefined };
      const inv = isModify
        ? await adminApi.createModifyLink(refereeId!, payload)
        : await adminApi.createInvitation(payload);
      setResult(inv);
      onDone(inv);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {isModify ? `Generate modification link for ${refereeName}` : 'Generate invitation link'}
        </h2>

        {!result ? (
          <>
            <div>
              <label className="label">Note (for your reference)</label>
              <input className="input" value={note} placeholder='e.g. "For Mario Valdivia - Quandela"'
                onChange={e => setNote(e.target.value)} />
            </div>

            <div>
              <label className="label">
                Referee&apos;s email
                <span className="ml-1.5 text-gray-500 font-normal">(optional — sends link automatically)</span>
              </label>
              <input className="input" type="email" value={refereeEmail}
                placeholder="mario@quandela.com"
                onChange={e => setRefereeEmail(e.target.value)} />
            </div>

            <div>
              <label className="label">Link expires in</label>
              <div className="flex gap-2 flex-wrap">
                {['7', '14', '30'].map(d => (
                  <button key={d} onClick={() => setDays(d)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: days === d ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', color: days === d ? '#a78bfa' : '#9ca3af', border: days === d ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)' }}>
                    {d} days
                  </button>
                ))}
                <input type="number" min="1" max="365" value={days}
                  onChange={e => setDays(e.target.value)}
                  className="input w-24 text-center" placeholder="Custom" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={generate} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Generating…' : refereeEmail.trim() ? 'Generate & send link' : 'Generate link'}
              </button>
              <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-green-400 text-sm font-semibold">✓ Link ready</p>
              {result.email_sent && (
                <p className="text-green-300 text-xs">
                  ✉ Invitation email sent to {(result as any).referee_email}
                </p>
              )}
              <p className="text-gray-300 text-xs break-all font-mono">{result.link}</p>
              <div className="flex items-center justify-between">
                <CopyButton text={result.link} />
                <p className="text-gray-500 text-xs">
                  Expires {new Date(result.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function RefereesPage() {
  const [tab, setTab]         = useState<'referees' | 'invitations'>('referees');
  const [items, setItems]     = useState<Referee[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Referee | null>(null);
  const [form, setForm]           = useState({ ...emptyForm });
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [orgLogoFile, setOrgLogoFile] = useState<File | null>(null);
  const [saving, setSaving]   = useState(false);
  const [inviteModal, setInviteModal] = useState<{ refereeId?: string; refereeName?: string } | null>(null);

  async function loadReferees() {
    try { setItems(await adminApi.getReferees()); }
    catch { }
  }
  async function loadInvitations() {
    try { setInvitations(await adminApi.getInvitations()); }
    catch { }
  }
  async function load() {
    setLoading(true);
    await Promise.all([loadReferees(), loadInvitations()]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm({ ...emptyForm });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }
  function openEdit(r: Referee) {
    setEditing(r);
    setForm({
      name: r.name, title: r.title, organization: r.organization,
      relationship: r.relationship, review: r.review || '',
      linkedin_url: r.linkedin_url || '', email: r.email || '', phone: r.phone || '',
      available_on_request: String(r.available_on_request),
      visible: String(r.visible), order_index: String(r.order_index ?? 0),
    });
    setPhotoFile(null); setOrgLogoFile(null); setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile)   fd.append('photo',    photoFile);
      if (orgLogoFile) fd.append('org_logo', orgLogoFile);
      editing
        ? await adminApi.updateReferee(editing.id, fd)
        : await adminApi.createReferee(fd);
      setShowForm(false); loadReferees();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this referee?')) return;
    try { await adminApi.deleteReferee(id); loadReferees(); }
    catch (e: any) { alert(e.message); }
  }

  async function toggleVisibility(r: Referee) {
    try {
      await adminApi.toggleRefereeVisibility(r.id, !r.visible);
      loadReferees();
    } catch (e: any) { alert(e.message); }
  }

  async function revokeInvitation(id: string) {
    if (!confirm('Revoke this invitation link?')) return;
    try { await adminApi.revokeInvitation(id); loadInvitations(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  const modRequested = items.filter(r => r.modification_requested);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Referees</h1>
          <p className="text-gray-500 text-sm mt-0.5">{items.length} total · {invitations.filter(i => !i.used && !i.expired).length} active links</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setInviteModal({})} className="btn-ghost text-sm">
            + Generate invitation link
          </button>
          <button onClick={openNew} className="btn-primary">+ Add referee</button>
        </div>
      </div>

      {/* Modification requested alert */}
      {modRequested.length > 0 && (
        <div className="mb-5 p-4 rounded-xl flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-yellow-400 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-yellow-400 font-semibold text-sm">Modification requested</p>
            <p className="text-yellow-300/70 text-xs mt-0.5">
              {modRequested.map(r => r.name).join(', ')} {modRequested.length === 1 ? 'has' : 'have'} requested changes to their reference.
              Generate a modification link and send it to them.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {(['referees', 'invitations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors"
            style={tab === t
              ? { background: 'rgba(124,58,237,0.25)', color: '#a78bfa' }
              : { color: '#6b7280' }}>
            {t} {t === 'invitations' && `(${invitations.length})`}
          </button>
        ))}
      </div>

      {/* ── Referees Tab ─────────────────────────────────────── */}
      {tab === 'referees' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map(r => (
            <div key={r.id} className="card space-y-3 relative">
              {/* Modification badge */}
              {r.modification_requested && (
                <div className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24' }}>
                  ⚠ Mod requested
                </div>
              )}

              {/* Header */}
              <div className="flex gap-3 items-start">
                {r.has_photo
                  ? <img src={adminApi.refereePhoto(r.id)} alt={r.name}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                }
                <div className="min-w-0 flex-1 pr-20">
                  <p className="text-white font-semibold text-sm truncate">{r.name}</p>
                  <p className="text-indigo-400 text-xs">{r.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {r.has_org_logo
                      ? <img src={adminApi.refereeOrgLogo(r.id)} alt={r.organization}
                          className="w-4 h-4 object-contain rounded" />
                      : null
                    }
                    <p className="text-gray-500 text-xs truncate">{r.organization}</p>
                  </div>
                </div>
              </div>

              {/* Visibility toggle */}
              <button onClick={() => toggleVisibility(r)}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-colors w-fit"
                style={r.visible
                  ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }
                  : { background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', color: '#6b7280' }}>
                <span>{r.visible ? '● Visible' : '○ Hidden'}</span>
              </button>

              {/* Actions */}
              <div className="flex gap-3 flex-wrap pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => openEdit(r)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                <button onClick={() => handleDelete(r.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                <button
                  onClick={() => setInviteModal({ refereeId: r.id, refereeName: r.name })}
                  className="text-xs text-yellow-400 hover:text-yellow-300 ml-auto">
                  Generate mod link
                </button>
              </div>
            </div>
          ))}
          {!items.length && (
            <p className="text-gray-500 text-sm text-center py-12 col-span-2">No referees yet.</p>
          )}
        </div>
      )}

      {/* ── Invitations Tab ──────────────────────────────────── */}
      {tab === 'invitations' && (
        <div className="space-y-3">
          {invitations.map(inv => {
            const expired = inv.expired;
            const used    = inv.used;
            const active  = !expired && !used;
            return (
              <div key={inv.id} className="card flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={inv.type === 'modify'
                        ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                        : { background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}>
                      {inv.type === 'modify' ? '✏ Modify' : '+ New'}
                    </span>
                    {inv.referee_name && (
                      <span className="text-gray-400 text-xs">{inv.referee_name}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      used    ? 'text-green-400 bg-green-400/10' :
                      expired ? 'text-gray-500 bg-gray-500/10' :
                                'text-cyan-400 bg-cyan-400/10'
                    }`}>
                      {used ? '✓ Used' : expired ? 'Expired' : 'Active'}
                    </span>
                  </div>
                  {inv.note && <p className="text-gray-300 text-sm">{inv.note}</p>}
                  <p className="text-gray-600 text-xs font-mono truncate">{inv.link}</p>
                  <p className="text-gray-600 text-xs">
                    Expires {new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {inv.used_at && ` · Used ${new Date(inv.used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  {active && <CopyButton text={inv.link} />}
                  {active && (
                    <button onClick={() => revokeInvitation(inv.id)}
                      className="text-xs text-red-400 hover:text-red-300">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!invitations.length && (
            <p className="text-gray-500 text-sm text-center py-12">No invitations yet.</p>
          )}
        </div>
      )}

      {/* ── Referee edit/create modal ─────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {editing ? 'Edit referee' : 'Add referee'}
            </h2>
            {[
              { key: 'name',         label: 'Full name',                       type: 'text'  },
              { key: 'title',        label: 'Job title',                       type: 'text'  },
              { key: 'organization', label: 'Company / Institution',           type: 'text'  },
              { key: 'relationship', label: 'Relationship (e.g. Direct Manager)', type: 'text' },
              { key: 'linkedin_url', label: 'LinkedIn URL (optional)',          type: 'url'   },
              { key: 'email',        label: 'Email (optional)',                 type: 'email' },
              { key: 'phone',        label: 'Phone (optional)',                 type: 'tel'   },
              { key: 'order_index',  label: 'Order index',                     type: 'number'},
            ].map(f => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="label">Review / Testimonial (optional)</label>
              <textarea className="input min-h-[100px] resize-y" value={form.review}
                onChange={e => setForm(p => ({ ...p, review: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="avail" checked={form.available_on_request === 'true'}
                onChange={e => setForm(p => ({ ...p, available_on_request: String(e.target.checked) }))}
                className="w-4 h-4 accent-indigo-500" />
              <label htmlFor="avail" className="text-sm text-gray-300">
                Hide contact details publicly (show &ldquo;Available on request&rdquo;)
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="vis" checked={form.visible === 'true'}
                onChange={e => setForm(p => ({ ...p, visible: String(e.target.checked) }))}
                className="w-4 h-4 accent-indigo-500" />
              <label htmlFor="vis" className="text-sm text-gray-300">Visible on public portfolio</label>
            </div>
            <div>
              <label className="label">Referee photo (optional)</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="label">Company logo (optional)</label>
              <input type="file" accept="image/*" className="input py-1.5"
                onChange={e => setOrgLogoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite / modify link modal ───────────────────────── */}
      {inviteModal !== null && (
        <InviteModal
          refereeId={inviteModal.refereeId}
          refereeName={inviteModal.refereeName}
          onClose={() => setInviteModal(null)}
          onDone={inv => {
            setInvitations(prev => [inv, ...prev]);
            setTab('invitations');
          }}
        />
      )}
    </div>
  );
}
