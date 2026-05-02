'use client';
import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Something went wrong. Please try again.');
      setStatus('sent');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Reset password</h1>
          <p className="text-gray-500 text-sm mt-1">
            Enter your email and we&apos;ll send a reset link
          </p>
        </div>

        {status === 'sent' ? (
          <div className="card text-center space-y-4 py-8">
            <div className="w-14 h-14 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto text-2xl">
              ✉
            </div>
            <div>
              <p className="text-white font-semibold text-lg">Check your inbox</p>
              <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                If <span className="text-indigo-400">{email}</span> is linked to an admin account,
                you&apos;ll receive a reset link within a minute.
              </p>
              <p className="text-gray-600 text-xs mt-3">The link expires in 1 hour.</p>
            </div>
            <Link href="/login" className="btn-ghost inline-flex text-sm mt-2">
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                className="input"
                type="email"
                required
                autoFocus
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <p className="text-gray-600 text-xs mt-1.5">
                Enter the email address associated with your admin account.
              </p>
            </div>

            {status === 'error' && (
              <p className="text-red-400 text-sm">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="btn-primary w-full justify-center">
              {status === 'loading' ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="text-center text-sm text-gray-500">
              <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                ← Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
