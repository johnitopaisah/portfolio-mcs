'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { setToken, consumeReturnTo } from '@/lib/authSession';

export default function LoginPage() {
  const router = useRouter();
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await adminApi.login(creds.username, creds.password);
      setToken(data.token);
      router.push(consumeReturnTo());
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="aurora-blob aurora-blob-4" />

      <div className="login-wrapper">
        <div className="login-heading">
          <h1>Portfolio Admin</h1>
          <p>Sign in to manage your content</p>
        </div>

        <form onSubmit={handleSubmit} className="login-card">
          <div className="login-field">
            <label className="login-label">Username</label>
            <input
              className="login-input" type="text" required autoFocus
              placeholder="Enter your username"
              value={creds.username}
              onChange={e => setCreds(p => ({ ...p, username: e.target.value }))}
            />
          </div>
          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              className="login-input" type="password" required
              placeholder="••••••••"
              value={creds.password}
              onChange={e => setCreds(p => ({ ...p, password: e.target.value }))}
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="login-btn">
            {loading ? <span className="login-spinner" /> : 'Sign in'}
          </button>
          <p className="login-footer">
            <Link href="/forgot-password">Forgot your password?</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
