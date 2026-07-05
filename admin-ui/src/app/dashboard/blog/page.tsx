'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  medium_url: string;
  tags: string[];
  published_at: string | null;
  ingested_at: string;
  visible_on_site: boolean;
  linkedin_shared_at: string | null;
  linkedin_post_urn: string | null;
}

type LinkedInStatus =
  | { connected: false }
  | { connected: true; name: string; expiresAt: string };

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function syncStatusColor(days: number | null) {
  if (days === null) return { color: '#94a3b8', bg: 'rgba(100,116,139,0.12)' };
  if (days < 7)      return { color: '#4ade80', bg: 'rgba(34,197,94,0.12)' };
  if (days < 14)     return { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' };
  return               { color: '#f87171',  bg: 'rgba(239,68,68,0.12)' };
}

function buildCaption(post: BlogPost): string {
  const lines: string[] = [];
  lines.push(post.title);
  lines.push('');
  if (post.excerpt) {
    const short = post.excerpt.length > 220 ? `${post.excerpt.slice(0, 217)}…` : post.excerpt;
    lines.push(short);
    lines.push('');
  }
  lines.push(`Read the full article →\n${post.medium_url.split('?')[0]}`);
  if (post.tags.length) {
    lines.push('');
    lines.push(post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' '));
  }
  return lines.join('\n');
}

// ── LinkedIn icon ─────────────────────────────────────────────────────────────
function LinkedInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

export default function BlogPage() {

  const [posts, setPosts]             = useState<BlogPost[]>([]);
  const [loading, setLoading]         = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<string | null>(null);
  const [editId, setEditId]           = useState<string | null>(null);
  const [editForm, setEditForm]       = useState({ excerpt: '', cover_image_url: '', tags: '' });

  // LinkedIn state
  const [liStatus, setLiStatus]       = useState<LinkedInStatus>({ connected: false });
  const [liLoading, setLiLoading]     = useState(true);
  const [liConnecting, setLiConnecting] = useState(false);
  const [liToast, setLiToast]         = useState<string | null>(null);
  const [sharePost, setSharePost]     = useState<BlogPost | null>(null);
  const [caption, setCaption]         = useState('');
  const [sharing, setSharing]         = useState(false);
  const [shareError, setShareError]   = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  function showToast(msg: string) {
    setLiToast(msg);
    setTimeout(() => setLiToast(null), 4000);
  }

  const loadPosts = useCallback(() => {
    setLoading(true);
    adminApi.getBlogPosts()
      .then((data: BlogPost[]) => setPosts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadLiStatus = useCallback(() => {
    setLiLoading(true);
    adminApi.getLinkedInStatus()
      .then((s: LinkedInStatus) => setLiStatus(s))
      .catch(() => setLiStatus({ connected: false }))
      .finally(() => setLiLoading(false));
  }, []);

  useEffect(() => {
    loadPosts();
    loadLiStatus();
  }, [loadPosts, loadLiStatus]);

  // Handle ?linkedin= redirect from OAuth callback
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('linkedin');
    if (!param) return;
    if (param === 'connected') {
      showToast('LinkedIn connected successfully!');
      loadLiStatus();
    } else if (param === 'denied') {
      showToast('LinkedIn connection cancelled.');
    } else if (param === 'error') {
      showToast('LinkedIn connection failed — please try again.');
    }
    window.history.replaceState({}, '', '/dashboard/blog');
  }, [loadLiStatus]);

  const lastSyncDays  = posts.length ? Math.min(...posts.map(p => daysAgo(p.ingested_at))) : null;
  const statusColor   = syncStatusColor(lastSyncDays);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await adminApi.syncBlog();
      setSyncMsg(`Synced — ${result.created} new, ${result.updated} updated`);
      loadPosts();
    } catch (err: any) {
      setSyncMsg(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleVisible(post: BlogPost) {
    const updated = await adminApi.updateBlogPost(post.id, { visible_on_site: !post.visible_on_site }).catch(() => null);
    if (updated) setPosts(prev => prev.map(p => p.id === post.id ? updated : p));
  }

  function startEdit(post: BlogPost) {
    setEditId(post.id);
    setEditForm({ excerpt: post.excerpt || '', cover_image_url: post.cover_image_url || '', tags: post.tags.join(', ') });
  }

  async function saveEdit(id: string) {
    const updated = await adminApi.updateBlogPost(id, {
      excerpt: editForm.excerpt,
      cover_image_url: editForm.cover_image_url,
      tags: editForm.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
    }).catch(() => null);
    if (updated) { setPosts(prev => prev.map(p => p.id === id ? updated : p)); setEditId(null); }
  }

  // LinkedIn connect
  async function handleConnect() {
    setLiConnecting(true);
    try {
      const { url } = await adminApi.getLinkedInAuthUrl();
      window.location.href = url;
    } catch {
      showToast('Could not start LinkedIn auth — check API config.');
      setLiConnecting(false);
    }
  }

  async function handleDisconnect() {
    await adminApi.disconnectLinkedIn().catch(() => null);
    setLiStatus({ connected: false });
    showToast('LinkedIn disconnected.');
  }

  async function handleDeleteShare(post: BlogPost) {
    if (!confirm(`Delete the LinkedIn post for "${post.title}"? This cannot be undone.`)) return;
    setDeletingId(post.id);
    try {
      await adminApi.deleteLinkedInShare(post.id);
      setPosts(prev => prev.map(p => p.id === post.id
        ? { ...p, linkedin_shared_at: null, linkedin_post_urn: null }
        : p
      ));
      showToast('LinkedIn post deleted.');
    } catch {
      showToast('Failed to delete — please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  // Open share modal
  function openShare(post: BlogPost) {
    setSharePost(post);
    setCaption(buildCaption(post));
    setShareError(null);
  }

  async function handleShare() {
    if (!sharePost) return;
    setSharing(true);
    setShareError(null);
    try {
      const result = await adminApi.shareToLinkedIn(sharePost.id, caption);
      setPosts(prev => prev.map(p => p.id === sharePost.id
        ? { ...p, linkedin_shared_at: result.sharedAt, linkedin_post_urn: result.postUrn }
        : p
      ));
      setSharePost(null);
      showToast('Published to LinkedIn!');
    } catch (err: any) {
      setShareError(err.message || 'Failed to publish — please try again.');
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Blog</h1>
      <p className="text-gray-500 text-sm mb-6">
        Pull posts from your Medium feed, review them, and share to LinkedIn.
      </p>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {liToast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl"
          style={{ background: 'rgba(30,16,60,0.98)', border: '1px solid rgba(168,85,247,0.4)', color: '#DDD6FE' }}>
          {liToast}
        </div>
      )}

      {/* ── LinkedIn connection banner ─────────────────────────────────────── */}
      <div className="card max-w-2xl p-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: liStatus.connected ? 'rgba(10,102,194,0.2)' : 'rgba(100,116,139,0.12)' }}>
            <LinkedInIcon size={16} />
          </div>
          {liLoading ? (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Checking LinkedIn…</span>
          ) : liStatus.connected ? (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                Connected as <span style={{ color: '#60a5fa' }}>{(liStatus as any).name}</span>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Token valid · auto-refreshes before expiry
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>LinkedIn not connected</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Connect to publish posts directly to your profile</p>
            </div>
          )}
        </div>

        {!liLoading && (
          liStatus.connected ? (
            <button onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              Disconnect
            </button>
          ) : (
            <button onClick={handleConnect} disabled={liConnecting}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'rgba(10,102,194,0.85)', color: '#fff' }}>
              <LinkedInIcon size={12} />
              {liConnecting ? 'Redirecting…' : 'Connect LinkedIn'}
            </button>
          )
        )}
      </div>

      {/* ── Sync panel ────────────────────────────────────────────────────── */}
      <div className="card max-w-2xl p-5 mb-8 flex items-center justify-between gap-4">
        <div>
          <button onClick={handleSync} disabled={syncing} className="btn-primary">
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          {syncMsg && <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{syncMsg}</p>}
        </div>
        <div className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: statusColor.bg, color: statusColor.color }}>
          {lastSyncDays === null ? 'Never synced' : `Last synced ${lastSyncDays}d ago`}
        </div>
      </div>

      {/* ── Post list ─────────────────────────────────────────────────────── */}
      <div className="space-y-3 max-w-2xl">
        {posts.length === 0 && (
          <p className="text-gray-500 text-sm">No posts yet — click &quot;Sync Now&quot; to pull from Medium.</p>
        )}
        {posts.map(post => {
          const isEditing = editId === post.id;
          const shared    = !!post.linkedin_shared_at;

          return (
            <div key={post.id} className="card p-4" style={{ opacity: post.visible_on_site ? 1 : 0.55 }}>
              {isEditing ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="label text-xs">Excerpt</label>
                    <textarea className="input text-sm" rows={3} value={editForm.excerpt}
                      onChange={e => setEditForm(p => ({ ...p, excerpt: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label text-xs">Cover image URL</label>
                    <input className="input text-sm" value={editForm.cover_image_url}
                      onChange={e => setEditForm(p => ({ ...p, cover_image_url: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label text-xs">Tags (comma separated)</label>
                    <input className="input text-sm" value={editForm.tags}
                      onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(post.id)} className="btn-primary text-xs py-1.5 px-4">Save</button>
                    <button onClick={() => setEditId(null)}
                      className="text-xs px-4 py-1.5 rounded-lg transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {post.cover_image_url && (
                    <img src={post.cover_image_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{post.title}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                      {post.tags.join(', ') || 'No tags'}
                    </p>
                    {shared && (
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#60a5fa' }}>
                        <LinkedInIcon size={10} />
                        Shared {new Date(post.linkedin_shared_at!).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <button onClick={() => toggleVisible(post)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={post.visible_on_site
                        ? { background: 'rgba(34,197,94,0.12)',   color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                        : { background: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }
                      }>
                      {post.visible_on_site ? 'Visible' : 'Hidden'}
                    </button>
                    <button onClick={() => startEdit(post)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      Edit
                    </button>
                    <a href={post.medium_url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      View
                    </a>
                    {liStatus.connected && !shared && (
                      <button
                        onClick={() => openShare(post)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: 'rgba(10,102,194,0.85)', color: '#fff' }}>
                        <LinkedInIcon size={11} />
                        Share
                      </button>
                    )}
                    {liStatus.connected && shared && (
                      <>
                        <button
                          onClick={() => handleDeleteShare(post)}
                          disabled={deletingId === post.id}
                          className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                          style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                          {deletingId === post.id ? 'Deleting…' : 'Delete post'}
                        </button>
                        <button
                          onClick={() => openShare(post)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'rgba(10,102,194,0.15)', color: '#60a5fa', border: '1px solid rgba(10,102,194,0.3)' }}>
                          <LinkedInIcon size={11} />
                          Reshare
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Share modal ────────────────────────────────────────────────────── */}
      {sharePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSharePost(null); }}>
          <div className="w-full max-w-lg rounded-2xl flex flex-col"
            style={{ background: 'rgba(14,7,36,0.98)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(10,102,194,0.25)' }}>
                  <LinkedInIcon size={14} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Share to LinkedIn</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    Publishes to your personal profile
                  </p>
                </div>
              </div>
              <button onClick={() => setSharePost(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Cover image preview */}
            {sharePost.cover_image_url ? (
              <div className="px-5 pt-4">
                <div className="relative rounded-xl overflow-hidden mb-1"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img
                    src={sharePost.cover_image_url}
                    alt={sharePost.title}
                    className="w-full object-cover"
                    style={{ maxHeight: '180px' }}
                  />
                </div>
                <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: '#4ade80' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  Image will be uploaded directly to LinkedIn
                </p>
              </div>
            ) : (
              <div className="px-5 pt-4">
                <div className="flex items-center gap-2.5 p-3 rounded-xl mb-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-2)' }}>{sharePost.title}</p>
                </div>
                <p className="text-xs mb-3" style={{ color: '#fbbf24' }}>
                  No cover image — will post as article link card
                </p>
              </div>
            )}

            {/* Caption editor */}
            <div className="px-5 pb-2 flex-1 overflow-auto">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>
                Caption <span style={{ color: 'rgba(255,255,255,0.2)' }}>· edit before publishing</span>
              </label>
              <textarea
                className="input text-sm w-full"
                rows={10}
                value={caption}
                onChange={e => setCaption(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {caption.length} chars
              </p>
            </div>

            {/* Error */}
            {shareError && (
              <p className="mx-5 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {shareError}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 px-5 py-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => setSharePost(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                Cancel
              </button>
              <button onClick={handleShare} disabled={sharing || !caption.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: sharing ? 'rgba(10,102,194,0.5)' : 'rgba(10,102,194,0.9)', color: '#fff' }}>
                <LinkedInIcon size={13} />
                {sharing ? 'Publishing…' : 'Publish to LinkedIn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
