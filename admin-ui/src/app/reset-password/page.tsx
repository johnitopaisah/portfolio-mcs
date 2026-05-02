'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token');

  const [form, setForm]         = useState({ password: '', confirm: '' });
  const [status, setStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) router.replace('/forgot-password');
  }, [token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (form.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStatus('success');
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.');
      setStatus('error');
    }
  }

  if (!token) return null;

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Set new password</h1>
        <p className="text-gray-500 text-sm mt-1">Choose a strong password for your admin account</p>
      </div>

      {status === 'success' ? (
        <div className="card text-center space-y-4 py-8">
          <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Password updated!</p>
            <p className="text-gray-400 text-sm mt-1">Your password has been changed successfully.</p>
            <p className="text-gray-600 text-xs mt-2">Redirecting to sign in…</p>
          </div>
          <Link href="/login" className="btn-primary inline-flex text-sm">Sign in now →</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              className="input" type="password" required autoFocus
              placeholder="At least 8 characters"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              className="input" type="password" required
              placeholder="Repeat your new password"
              value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
            />
          </div>

          {form.password.length > 0 && (
            <div className="space-y-1">
              {[
                { ok: form.password.length >= 8,   label: 'At least 8 characters' },
                { ok: /[A-Z]/.test(form.password), label: 'One uppercase letter'  },
                { ok: /[0-9]/.test(form.password), label: 'One number'            },
              ].map(r => (
                <p key={r.label} className={`text-xs flex items-center gap-1.5 ${r.ok ? 'text-green-400' : 'text-gray-600'}`}>
                  <span>{r.ok ? '✓' : '○'}</span>{r.label}
                </p>
              ))}
            </div>
          )}

          {(status === 'error' || errorMsg) && (
            <p className="text-red-400 text-sm">{errorMsg}</p>
          )}

          <button type="submit" disabled={status === 'loading'} className="btn-primary w-full justify-center">
            {status === 'loading' ? 'Updating…' : 'Set new password'}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              ← Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={
        <div className="w-full max-w-sm text-center text-gray-500 text-sm">Loading…</div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
