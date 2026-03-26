'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

interface Msg { id: string; name: string; email: string; subject: string; message: string; read: boolean; created_at: string; }

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [selected, setSelected] = useState<Msg | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try { setMsgs(await adminApi.getMessages()); } catch { } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function open(m: Msg) {
    setSelected(m);
    if (!m.read) {
      await adminApi.markRead(m.id).catch(() => {});
      setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, read: true } : x));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this message?')) return;
    try { await adminApi.deleteMessage(id); setSelected(null); load(); } catch (e: any) { alert(e.message); }
  }

  const fmt = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const unread = msgs.filter(m => !m.read).length;

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="text-gray-500 text-sm mt-0.5">{unread} unread · {msgs.length} total</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* List */}
        <div className="space-y-2">
          {msgs.map(m => (
            <button key={m.id} onClick={() => open(m)}
              className={`w-full text-left card transition-colors ${selected?.id === m.id ? 'border-indigo-500' : ''} ${!m.read ? 'border-indigo-500/40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!m.read && <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                    <p className={`text-sm truncate ${!m.read ? 'text-white font-medium' : 'text-gray-300'}`}>{m.name}</p>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{m.subject}</p>
                </div>
                <p className="text-xs text-gray-600 flex-shrink-0">{fmt(m.created_at)}</p>
              </div>
            </button>
          ))}
          {!msgs.length && <p className="text-gray-500 text-sm text-center py-12">No messages yet.</p>}
        </div>

        {/* Detail pane */}
        {selected ? (
          <div className="card space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-semibold">{selected.name}</p>
                <a href={`mailto:${selected.email}`} className="text-indigo-400 text-sm hover:underline">{selected.email}</a>
                <p className="text-gray-500 text-xs mt-1">{fmt(selected.created_at)}</p>
              </div>
              <button onClick={() => handleDelete(selected.id)} className="btn-danger text-xs">Delete</button>
            </div>
            <div className="border-t border-gray-800 pt-4">
              <p className="text-gray-300 font-medium text-sm mb-2">{selected.subject}</p>
              <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
            </div>
            <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
              className="btn-primary inline-flex text-sm">
              Reply via email
            </a>
          </div>
        ) : (
          <div className="card flex items-center justify-center text-gray-600 text-sm">
            Select a message to read
          </div>
        )}
      </div>
    </div>
  );
}
